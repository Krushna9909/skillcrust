/**
 * tests/rewardEngine.test.js
 *
 * Checkpoint 3's required deliverable: "Unit tests / manual test cases
 * replicating the spec's User1-User4 worked example, since this is the
 * easiest place for silent bugs." These are integration tests, not pure
 * unit tests — they run src/services/rewardEngine.js against a REAL
 * Postgres database (whatever `DATABASE_URL` in `.env` points at), the
 * same way every other checkpoint so far has been manually verified. No
 * new test-framework dependency was added: Node 18+'s built-in
 * `node:test` + `node:assert/strict` are used, matching this project's
 * lean-dependency approach.
 *
 * *** HOW TO RUN ***
 *   npm run migrate:up   (if not already done)
 *   npm run seed         (needed — these tests require the COMPANY
 *                          account and the seeded courses to exist)
 *   npm test
 *
 * *** SAFE TO RUN AGAINST A SHARED/DEV DATABASE ***
 * Every user/purchase/reward_transactions row this file creates is
 * tracked and deleted in `after()`, in FK-safe order (children before
 * parents). The one shared, non-disposable account these tests touch —
 * COMPANY — has every credit `after()` applied to it during the run
 * explicitly reversed too (see that hook's comments), so COMPANY's
 * wallet_balance is back to whatever it was before this file ran, not
 * silently inflated by however many times the suite has been re-run. Test
 * users get randomized emails/phones/refer-codes so repeated runs never
 * collide with leftover data. The one caveat: if the process is killed
 * mid-run (not a clean `after()` exit), cleanup won't happen and a
 * handful of harmless `test-*@example.invalid` rows — plus COMPANY's
 * balance reflecting whatever partial run occurred — will be left behind;
 * safe to ignore or clean up manually. Do NOT point this at a production
 * database regardless — it's still live financial-logic code running
 * against whatever DB is configured.
 *
 * These tests call `rewardEngine.processPendingPurchase` directly (not
 * through HTTP/Express) — this checkpoint's ask is specifically to verify
 * the REWARD MATH, not re-test Checkpoint 2's auth/validation layer.
 * HTTP-level route tests (e.g. with supertest) would be a reasonable
 * addition for a later integration-pass checkpoint (13) if wanted — not
 * added here to avoid introducing a new dependency for this checkpoint's
 * specific, narrower goal.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { pool } = require('../src/config/db');
const userModel = require('../src/models/user.model');
const purchaseModel = require('../src/models/purchase.model');
const rewardEngine = require('../src/services/rewardEngine');
const { hashPassword } = require('../src/utils/password');
const { COMPANY_REFER_CODE } = require('../src/utils/constants');

const createdUserIds = []; // creation order — deleted in REVERSE (children before parents)
const createdPurchaseIds = [];
let phoneCounter = 0;

function uniqueSuffix() {
  return crypto.randomBytes(4).toString('hex');
}

function uniquePhone() {
  phoneCounter += 1;
  // Doesn't need to look like a real number — the DB only enforces
  // uniqueness, not format (format validation lives in Checkpoint 2's
  // HTTP layer, which these tests deliberately bypass).
  return `9${Date.now().toString().slice(-8)}${phoneCounter}`.slice(0, 10);
}

async function createTestUser({ referrerId }) {
  const suffix = uniqueSuffix();
  const passwordHash = await hashPassword('TestPassword123!');
  const user = await userModel.createUser(pool, {
    referCode: `T${suffix}`.toUpperCase().slice(0, 8),
    referrerId,
    fullName: `Reward Engine Test User ${suffix}`,
    email: `test-${suffix}@example.invalid`,
    phone: uniquePhone(),
    passwordHash,
    state: 'Maharashtra',
  });
  createdUserIds.push(user.id);
  return user;
}

async function getCourseByName(name) {
  const result = await pool.query(
    'SELECT id, name, price, direct_bonus, indirect_bonus, company_cut FROM courses WHERE name = $1',
    [name]
  );
  if (!result.rows[0]) {
    throw new Error(`Test fixture course "${name}" not found — did you run \`npm run seed\`?`);
  }
  return result.rows[0];
}

async function getCompany() {
  const company = await userModel.findByReferCode(pool, COMPANY_REFER_CODE);
  if (!company) {
    throw new Error('COMPANY system account not found — did you run `npm run seed`?');
  }
  return company;
}

async function getBalances(userIds) {
  const result = await pool.query(
    'SELECT id, wallet_balance FROM users WHERE id = ANY($1::int[])',
    [userIds]
  );
  const map = {};
  for (const row of result.rows) {
    map[row.id] = Number(row.wallet_balance);
  }
  return map;
}

function delta(before, after_, userId) {
  return Number((after_[userId] - before[userId]).toFixed(2));
}

async function buyAndProcess({ buyerId, course, simulate }) {
  const purchase = await purchaseModel.createPendingPurchase(pool, {
    buyerId,
    courseId: course.id,
    amount: course.price,
  });
  createdPurchaseIds.push(purchase.id);
  const outcome = await rewardEngine.processPendingPurchase(purchase.id, { simulate });
  return { purchase, outcome };
}

async function getRewardRows(purchaseId) {
  const result = await pool.query(
    'SELECT reward_type, recipient_id, amount FROM reward_transactions WHERE purchase_id = $1 ORDER BY reward_type',
    [purchaseId]
  );
  return result.rows;
}

let initialCompanyBalance;

before(async () => {
  // Fail fast with a clear message rather than confusing assertion
  // failures deep in a test if the DB isn't migrated/seeded.
  const company = await getCompany();
  await getCourseByName('SKILLS PRO');
  initialCompanyBalance = Number((await getBalances([company.id]))[company.id]);
});

after(async () => {
  try {
    if (createdPurchaseIds.length > 0) {
      // COMPANY is the one recipient in these tests that is NOT itself a
      // disposable fixture we're about to delete — it's the real, shared,
      // permanently-seeded system account. Every OTHER recipient is one of
      // our own test users, whose wallet_balance disappears along with
      // their row below. Without this, COMPANY's wallet_balance would
      // silently and permanently accumulate real amounts on every test
      // run, drifting further from the sum of its (still-accurate)
      // reward_transactions ledger each time — a genuine bug caught by
      // actually re-running this suite twice in a row and comparing
      // COMPANY's balance before/after, not something left as a comment
      // without checking. Compute what we credited to COMPANY BEFORE
      // deleting those reward_transactions rows, then reverse it.
      const companyCredited = await pool.query(
        `SELECT recipient_id, COALESCE(SUM(amount), 0) AS total
         FROM reward_transactions
         WHERE purchase_id = ANY($1::int[])
         GROUP BY recipient_id`,
        [createdPurchaseIds]
      );

      await pool.query('DELETE FROM reward_transactions WHERE purchase_id = ANY($1::int[])', [createdPurchaseIds]);
      await pool.query('DELETE FROM purchases WHERE id = ANY($1::int[])', [createdPurchaseIds]);

      // Reverse every credit that landed on an account NOT among our own
      // created (and about-to-be-deleted) test users — in practice this
      // is only ever COMPANY, but written generally in case a future test
      // in this file credits some other pre-existing account.
      const createdIdSet = new Set(createdUserIds);
      for (const row of companyCredited.rows) {
        if (!createdIdSet.has(row.recipient_id) && Number(row.total) !== 0) {
          // eslint-disable-next-line no-await-in-loop
          await pool.query(
            'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2',
            [row.total, row.recipient_id]
          );
        }
      }
    }
    // Reverse order: later-created users may reference earlier ones as
    // referrer_id (ON DELETE RESTRICT) — delete children before parents.
    for (const id of [...createdUserIds].reverse()) {
      // eslint-disable-next-line no-await-in-loop
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
    }

    // Regression check for the exact bug this cleanup exists to prevent
    // (caught by actually re-running this suite and diffing COMPANY's
    // balance, not assumed): COMPANY's balance must be EXACTLY what it
    // was before this file touched it, every single run.
    const company = await getCompany();
    const finalCompanyBalance = Number((await getBalances([company.id]))[company.id]);
    assert.equal(
      finalCompanyBalance,
      initialCompanyBalance,
      `COMPANY's wallet_balance was not fully restored after cleanup ` +
      `(started at ${initialCompanyBalance}, ended at ${finalCompanyBalance}) — ` +
      'this means test-run pollution of a REAL, permanent account.'
    );
  } finally {
    await pool.end();
  }
});

test('spec1.md worked example: direct/indirect bonuses walk up exactly 2 tiers, fresh per purchase', async () => {
  const course = await getCourseByName('SKILLS PRO'); // 699 / 510 / 40 / 149 — sums exactly to price
  const company = await getCompany();

  // User1 -> User2 -> User3 -> User4, per spec1.md's chain
  const user1 = await createTestUser({ referrerId: company.id });
  const user2 = await createTestUser({ referrerId: user1.id });
  const user3 = await createTestUser({ referrerId: user2.id });
  const user4 = await createTestUser({ referrerId: user3.id });

  // --- User3 buys: Direct -> User2, Indirect -> User1 ---
  const before1 = await getBalances([user1.id, user2.id, company.id]);
  const { purchase: purchase1, outcome: outcome1 } = await buyAndProcess({
    buyerId: user3.id,
    course,
    simulate: 'success',
  });
  assert.equal(outcome1.status, 'success');
  const after1 = await getBalances([user1.id, user2.id, company.id]);

  assert.equal(delta(before1, after1, user2.id), Number(course.direct_bonus), 'User2 (direct referrer) should receive the direct bonus');
  assert.equal(delta(before1, after1, user1.id), Number(course.indirect_bonus), 'User1 (2 tiers up) should receive the indirect bonus');
  assert.equal(delta(before1, after1, company.id), Number(course.company_cut), 'COMPANY should always receive its cut');

  const rows1 = await getRewardRows(purchase1.id);
  assert.equal(rows1.length, 3, 'exactly 3 reward_transactions rows per successful purchase');

  // --- User4 buys: Direct -> User3, Indirect -> User2, User1 gets NOTHING from this one ---
  const before2 = await getBalances([user1.id, user2.id, user3.id, company.id]);
  const { outcome: outcome2 } = await buyAndProcess({
    buyerId: user4.id,
    course,
    simulate: 'success',
  });
  assert.equal(outcome2.status, 'success');
  const after2 = await getBalances([user1.id, user2.id, user3.id, company.id]);

  assert.equal(delta(before2, after2, user3.id), Number(course.direct_bonus), 'User3 (direct referrer) should receive the direct bonus');
  assert.equal(delta(before2, after2, user2.id), Number(course.indirect_bonus), 'User2 (2 tiers up from User4) should receive the indirect bonus');
  assert.equal(
    delta(before2, after2, user1.id),
    0,
    'User1 is 3 tiers up from User4 — past the 2-tier cutoff, must receive NOTHING from this purchase even though User1 sits at the top of the whole chain'
  );
  assert.equal(delta(before2, after2, company.id), Number(course.company_cut));
});

test('COMPANY-fallback: buyer with no real sponsor sends direct + indirect + company cut all to COMPANY, as 3 separate ledger rows', async () => {
  const course = await getCourseByName('SKILLS PRO');
  const company = await getCompany();

  // Signed up with no/invalid refer code -> referrer defaults to COMPANY
  // (Checkpoint 2's fallback). COMPANY's own referrer_id is null, so the
  // indirect tier also falls back to COMPANY — the one explicit fallback
  // case spec1.md names directly.
  const buyer = await createTestUser({ referrerId: company.id });

  const before = await getBalances([company.id]);
  const { purchase, outcome } = await buyAndProcess({ buyerId: buyer.id, course, simulate: 'success' });
  assert.equal(outcome.status, 'success');
  const after = await getBalances([company.id]);

  const expectedTotal = Number(course.direct_bonus) + Number(course.indirect_bonus) + Number(course.company_cut);
  assert.equal(delta(before, after, company.id), expectedTotal);
  // SKILLS PRO's three components sum exactly to its price (unlike
  // BUSINESS PRO's known ₹1 mismatch — see checkpoint.md's open items) —
  // worth asserting explicitly here as a sanity check on the fixture.
  assert.equal(expectedTotal, Number(course.price));

  const rows = await getRewardRows(purchase.id);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.recipient_id === company.id), 'all 3 reward legs should land on COMPANY');
  assert.deepEqual(rows.map((r) => r.reward_type).sort(), ['company', 'direct', 'indirect']);
});

test('failed payment: purchase marked failed, zero reward_transactions rows, zero wallet changes', async () => {
  const course = await getCourseByName('SKILLS PRO');
  const company = await getCompany();
  const buyer = await createTestUser({ referrerId: company.id });

  const before = await getBalances([company.id, buyer.id]);
  const { purchase, outcome } = await buyAndProcess({ buyerId: buyer.id, course, simulate: 'failure' });

  assert.equal(outcome.status, 'failed');
  assert.ok(outcome.failureReason, 'a failed outcome should always carry a human-readable reason');
  assert.equal(outcome.paymentGatewayReference, null);

  const after = await getBalances([company.id, buyer.id]);
  assert.equal(delta(before, after, company.id), 0);
  assert.equal(delta(before, after, buyer.id), 0);

  const rows = await getRewardRows(purchase.id);
  assert.equal(rows.length, 0, 'a failed purchase must credit nothing');

  const purchaseRow = await pool.query('SELECT status FROM purchases WHERE id = $1', [purchase.id]);
  assert.equal(purchaseRow.rows[0].status, 'failed');
});

test('ownership check reflects reality: false before a successful purchase, true after', async () => {
  const course = await getCourseByName('SKILLS PRO');
  const company = await getCompany();
  const buyer = await createTestUser({ referrerId: company.id });

  assert.equal(await purchaseModel.hasSuccessfulPurchase(pool, buyer.id, course.id), false);

  await buyAndProcess({ buyerId: buyer.id, course, simulate: 'success' });

  assert.equal(await purchaseModel.hasSuccessfulPurchase(pool, buyer.id, course.id), true);
});

test('processing an already-resolved purchase again throws and does NOT double-credit', async () => {
  const course = await getCourseByName('SKILLS PRO');
  const company = await getCompany();
  const buyer = await createTestUser({ referrerId: company.id });

  const { purchase } = await buyAndProcess({ buyerId: buyer.id, course, simulate: 'success' });

  const before = await getBalances([company.id]);
  await assert.rejects(
    () => rewardEngine.processPendingPurchase(purchase.id, { simulate: 'success' }),
    /not pending|resolved concurrently/,
    'resolving a non-pending purchase again should throw, not silently re-credit'
  );
  const after = await getBalances([company.id]);
  assert.equal(delta(before, after, company.id), 0, 'a rejected re-processing attempt must not change any balance');

  const rows = await getRewardRows(purchase.id);
  assert.equal(rows.length, 3, 'still exactly the original 3 rows, not 6');
});
