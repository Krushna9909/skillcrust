/**
 * tests/smokeTest.e2e.test.js
 *
 * Checkpoint 13: "End-to-end smoke test of signup → purchase → reward
 * crediting → withdrawal." Deliberately different from every other test
 * file in this project: those call model/service functions directly
 * (fast, focused, but they never prove the pieces are actually WIRED
 * TOGETHER correctly through the real HTTP layer — routes, middleware
 * order, cookie handling, request/response serialization). This file
 * starts the real Express app (`src/app.js`, unmodified — the exact same
 * app `server.js` runs in production) on an ephemeral port and drives it
 * with real `fetch()` calls, the same way a browser or `curl` would.
 *
 * No new dependency added — Node 18+'s built-in `fetch` is enough; no
 * `supertest` needed since the app is just listened on a real (if
 * ephemeral, in-process) TCP port for the test's duration.
 *
 * *** WHAT THIS PROVES THAT THE OTHER TEST FILES DON'T ***
 * Every other checkpoint's tests were already thorough about the LOGIC
 * (reward math, withdrawal state machine, KYC encryption, fraud
 * detection, auth token verification). What they don't cover is the
 * ASSEMBLY: is `/api/v1/auth/signup` actually reachable, does the auth
 * cookie actually round-trip through a real `Set-Cookie` header and back
 * via `Cookie` on the next request, does `POST /kyc/bank` really require
 * that same cookie, does a withdrawal really get blocked without KYC
 * when hit as a genuine HTTP request rather than a direct function call.
 * This file is the "does the whole thing actually work when used the way
 * it's actually used" check.
 *
 * *** HOW TO RUN ***
 *   npm run migrate:up && npm run seed && npm test
 * Needs a valid `.env` with a real Postgres reachable — same requirement
 * as every other test file, plus this one also needs a free ephemeral
 * port for the in-process server (Node picks one automatically via
 * `listen(0)`).
 *
 * *** CLEANUP ***
 * Same discipline as tests/rewardEngine.test.js: every created user,
 * purchase, KYC row, and withdrawal is tracked and deleted in `after()`,
 * and COMPANY's wallet_balance (credited via the real purchases this
 * file makes) is restored to its exact pre-test value — verified, not
 * assumed.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const app = require('../src/app');
const { pool } = require('../src/config/db');
const withdrawalEngine = require('../src/services/withdrawalEngine');
const userModel = require('../src/models/user.model');
const { COMPANY_REFER_CODE } = require('../src/utils/constants');

let server;
let baseUrl;
const createdUserIds = [];
const createdPurchaseIds = [];
let initialCompanyBalance;

function uniqueSuffix() {
  return crypto.randomBytes(4).toString('hex');
}

let phoneCounter = 0;
function uniquePhone() {
  phoneCounter += 1;
  // Must be digits only (validators.js's phone regex is [6-9]\d{9}) — the
  // hex `uniqueSuffix()` above can contain letters (a-f), which is why
  // this needs its own, separate, digits-only generator rather than
  // reusing that suffix directly (an actual bug caught by running this
  // test live, not assumed correct from reading the code).
  return `9${Date.now().toString().slice(-8)}${phoneCounter}`.slice(0, 10);
}

/**
 * Minimal cookie-jar-aware fetch wrapper — Node's built-in `fetch` does
 * NOT automatically persist cookies between calls the way a browser
 * does, so this smoke test needs to manually carry the `Set-Cookie` from
 * one response into the `Cookie` header of the next request, exactly
 * like `public/assets/js/api.js`'s `credentials: 'include'` relies on a
 * real browser to do automatically. Doing it manually here is itself
 * part of what proves the cookie mechanism genuinely works end to end.
 */
function makeSession() {
  let cookieHeader = '';
  return async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      // Multiple Set-Cookie headers get folded by undici into one
      // comma-joined string in some Node versions; split defensively and
      // keep just the `name=value` pairs (drop attributes like Path/
      // HttpOnly) to build the next request's Cookie header.
      const pairs = setCookie.split(/,(?=[^;]+?=)/).map((c) => c.split(';')[0].trim());
      const existing = cookieHeader ? cookieHeader.split('; ') : [];
      const merged = new Map(existing.map((p) => [p.split('=')[0], p]));
      for (const pair of pairs) merged.set(pair.split('=')[0], pair);
      cookieHeader = [...merged.values()].join('; ');
    }

    let data = null;
    try { data = await response.json(); } catch (e) { /* no body */ }
    return { status: response.status, ok: response.ok, data };
  };
}

before(async () => {
  const company = await userModel.findByReferCode(pool, COMPANY_REFER_CODE);
  if (!company) throw new Error('COMPANY system account not found — did you run `npm run seed`?');
  initialCompanyBalance = Number(
    (await pool.query('SELECT wallet_balance FROM users WHERE id = $1', [company.id])).rows[0].wallet_balance
  );

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
      resolve();
    });
  });
});

after(async () => {
  try {
    // Checkpoint 12b caught a real gap here, via live testing against
    // real accumulated data: this file's own signups (2 in the first
    // test, 1 more in the second — all from the same loopback IP,
    // within milliseconds of each other) hit Checkpoint 9's same-IP
    // fraud-detection threshold (3) exactly, creating a real
    // `fraud_flags` row as a side effect. Without this cleanup, that
    // row's `user_ids` would go on to reference users this file deletes
    // below — a genuinely dangling reference, found by noticing an
    // admin fraud-flags page showing a flag with zero resolved users.
    // Delete any flag this file's own users are implicated in BEFORE
    // deleting those users (array-overlap `&&`, not a specific id list,
    // since which exact signup triggers the flag depends on timing).
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM fraud_flags WHERE user_ids && $1::int[]', [createdUserIds]);
    }

    if (createdPurchaseIds.length > 0) {
      const companyCredited = await pool.query(
        `SELECT recipient_id, COALESCE(SUM(amount), 0) AS total
         FROM reward_transactions WHERE purchase_id = ANY($1::int[])
         GROUP BY recipient_id`,
        [createdPurchaseIds]
      );
      await pool.query('DELETE FROM reward_transactions WHERE purchase_id = ANY($1::int[])', [createdPurchaseIds]);
      await pool.query('DELETE FROM purchases WHERE id = ANY($1::int[])', [createdPurchaseIds]);

      const createdIdSet = new Set(createdUserIds);
      for (const row of companyCredited.rows) {
        if (!createdIdSet.has(row.recipient_id) && Number(row.total) !== 0) {
          // eslint-disable-next-line no-await-in-loop
          await pool.query('UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2', [row.total, row.recipient_id]);
        }
      }
    }
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM withdrawals WHERE user_id = ANY($1::int[])', [createdUserIds]);
      await pool.query('DELETE FROM kyc_type_a WHERE user_id = ANY($1::int[])', [createdUserIds]);
      await pool.query('DELETE FROM kyc_type_b WHERE user_id = ANY($1::int[])', [createdUserIds]);
    }
    for (const id of [...createdUserIds].reverse()) {
      // eslint-disable-next-line no-await-in-loop
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
    }

    const company = await userModel.findByReferCode(pool, COMPANY_REFER_CODE);
    const finalBalance = Number(
      (await pool.query('SELECT wallet_balance FROM users WHERE id = $1', [company.id])).rows[0].wallet_balance
    );
    assert.equal(finalBalance, initialCompanyBalance, "COMPANY's wallet_balance was not fully restored after cleanup");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});

test('full journey: signup -> referred purchase -> reward credited -> KYC -> withdrawal -> paid', async () => {
  const suffix = uniqueSuffix();
  const referrerSession = makeSession();
  const buyerSession = makeSession();

  // --- 1. Signup the referrer (no refer code -> falls back to COMPANY) ---
  const referrerSignup = await referrerSession('/auth/signup', {
    method: 'POST',
    body: {
      fullName: `Smoke Referrer ${suffix}`,
      email: `smoke-referrer-${suffix}@example.invalid`,
      phone: uniquePhone(),
      state: 'Maharashtra',
      password: 'SmokeTest123!',
      confirmPassword: 'SmokeTest123!',
      agreeToTerms: true,
      courseId: 1,
      simulate: 'success',
    },
  });
  assert.equal(referrerSignup.status, 201, JSON.stringify(referrerSignup.data));
  assert.equal(referrerSignup.data.purchase.status, 'success');
  const referrerId = referrerSignup.data.user.id;
  const referrerReferCode = referrerSignup.data.user.refer_code;
  createdUserIds.push(referrerId);
  createdPurchaseIds.push(referrerSignup.data.purchase.id);

  // --- 2. Signup a buyer REFERRED by the referrer, buying the same course ---
  const buyerSignup = await buyerSession('/auth/signup', {
    method: 'POST',
    body: {
      fullName: `Smoke Buyer ${suffix}`,
      email: `smoke-buyer-${suffix}@example.invalid`,
      phone: uniquePhone(),
      state: 'Karnataka',
      password: 'SmokeTest123!',
      confirmPassword: 'SmokeTest123!',
      agreeToTerms: true,
      courseId: 1,
      referCode: referrerReferCode,
      simulate: 'success',
    },
  });
  assert.equal(buyerSignup.status, 201, JSON.stringify(buyerSignup.data));
  assert.equal(buyerSignup.data.purchase.status, 'success');
  assert.equal(buyerSignup.data.referral.fallbackApplied, false, 'a valid refer code should not trigger the COMPANY fallback');
  const buyerId = buyerSignup.data.user.id;
  createdUserIds.push(buyerId);
  createdPurchaseIds.push(buyerSignup.data.purchase.id);

  // --- 3. Confirm reward crediting: the referrer's wallet actually grew ---
  const courseResult = await pool.query("SELECT direct_bonus FROM courses WHERE id = 1");
  const expectedDirectBonus = Number(courseResult.rows[0].direct_bonus);

  const referrerProfile = await referrerSession('/user/profile');
  assert.equal(referrerProfile.status, 200);
  assert.equal(
    Number(referrerProfile.data.profile.walletBalance),
    expectedDirectBonus,
    'referrer wallet balance should reflect exactly the direct bonus from the referred purchase'
  );

  // Also confirm it shows up on the dashboard's recent-referrals list —
  // real HTTP, real search, exactly how dashboard.js would call it.
  const dashboard = await referrerSession(`/user/dashboard?search=${encodeURIComponent(buyerSignup.data.user.full_name.split(' ')[0])}`);
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.data.recentReferrals.length, 1);
  assert.equal(dashboard.data.recentReferrals[0].buyerReferCode, buyerSignup.data.user.refer_code);

  // --- 4. Referrer submits KYC (Type A, bank) -------------------------------
  const kycSubmit = await referrerSession('/kyc/bank', {
    method: 'POST',
    body: {
      accountHolderName: `Smoke Referrer ${suffix}`,
      ifscCode: 'HDFC0001234',
      bankName: 'HDFC Bank',
      accountNumber: '123456789012',
      aadhaarNumber: '234567890123',
      panNumber: 'ABCDE1234F',
    },
  });
  assert.equal(kycSubmit.status, 200, JSON.stringify(kycSubmit.data));
  assert.equal(kycSubmit.data.kycTypeA.status, 'approved');
  assert.ok(kycSubmit.data.kycTypeA.aadhaarNumberMasked.endsWith('0123'), 'KYC response must be masked, even right after submission');

  // --- 5. Withdraw the full referral earnings to bank -----------------------
  const withdrawal = await referrerSession('/wallet/withdraw', {
    method: 'POST',
    body: {
      amount: expectedDirectBonus,
      method: 'bank',
      holderName: 'Referrer Smoke',
      holderEmail: 'referrer.smoke@example.com',
      accountNumber: '123456789012',
      ifscCode: 'HDFC0001234',
    },
  });
  // The request now stops at 'pending' — an admin approves it before
  // anything reaches the payout provider.
  assert.equal(withdrawal.status, 202, JSON.stringify(withdrawal.data));
  assert.equal(withdrawal.data.withdrawal.status, 'pending');

  const approved = await withdrawalEngine.approveAndPayout(
    withdrawal.data.withdrawal.id,
    { simulate: 'success' }
  );
  assert.equal(approved.status, 'paid');
  assert.ok(approved.payoutGatewayReference);

  // --- 6. Confirm the wallet is now zero, and history shows the payout -----
  const finalProfile = await referrerSession('/user/profile');
  assert.equal(Number(finalProfile.data.profile.walletBalance), 0);

  const history = await referrerSession('/wallet/withdrawals');
  assert.equal(history.status, 200);
  assert.equal(history.data.withdrawals.length, 1);
  assert.equal(history.data.withdrawals[0].status, 'paid');
  assert.equal(Number(history.data.withdrawals[0].amount), expectedDirectBonus);
});

test('withdrawal is genuinely blocked over real HTTP without KYC (not just at the model layer)', async () => {
  const suffix = uniqueSuffix();
  const session = makeSession();

  const signup = await session('/auth/signup', {
    method: 'POST',
    body: {
      fullName: `Smoke NoKyc ${suffix}`,
      email: `smoke-nokyc-${suffix}@example.invalid`,
      phone: uniquePhone(),
      state: 'Goa',
      password: 'SmokeTest123!',
      confirmPassword: 'SmokeTest123!',
      agreeToTerms: true,
      courseId: 1,
      simulate: 'success',
    },
  });
  assert.equal(signup.status, 201);
  createdUserIds.push(signup.data.user.id);
  createdPurchaseIds.push(signup.data.purchase.id);

  const withdrawAttempt = await session('/wallet/withdraw', {
    method: 'POST',
    body: { amount: 1, method: 'bank' },
  });
  assert.equal(withdrawAttempt.status, 403);
});

test('an unauthenticated request over real HTTP is genuinely rejected, not silently allowed through', async () => {
  const anonymous = makeSession();
  const result = await anonymous('/user/dashboard');
  assert.equal(result.status, 401);
});
