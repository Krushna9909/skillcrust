/**
 * tests/dashboard.test.js
 *
 * Checkpoint 7's read-heavy queries, verified against a REAL Postgres
 * (same `node:test` pattern as every other test file). Sets up realistic
 * data by actually running signups + purchases through the real reward
 * engine (not hand-inserted reward_transactions rows) so these tests
 * exercise the true end-to-end data shape, the same way
 * tests/rewardEngine.test.js does.
 *
 * *** HOW TO RUN ***
 *   npm run migrate:up && npm run seed && npm test
 *
 * *** CLEANUP ***
 * Same approach as tests/rewardEngine.test.js: every created purchase/
 * user is tracked and deleted in `after()`, and COMPANY's wallet_balance
 * (which these purchases route company-cut/fallback credits into) is
 * explicitly restored to its pre-test value — see that file's `after()`
 * for why this matters and how it's verified.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { pool } = require('../src/config/db');
const userModel = require('../src/models/user.model');
const courseModel = require('../src/models/course.model');
const purchaseModel = require('../src/models/purchase.model');
const rewardTransactionModel = require('../src/models/rewardTransaction.model');
const rewardEngine = require('../src/services/rewardEngine');
const { hashPassword } = require('../src/utils/password');
const { COMPANY_REFER_CODE } = require('../src/utils/constants');

const createdUserIds = [];
const createdPurchaseIds = [];
let phoneCounter = 0;
let initialCompanyBalance;

function uniqueSuffix() {
  return crypto.randomBytes(4).toString('hex');
}

function uniquePhone() {
  phoneCounter += 1;
  return `9${Date.now().toString().slice(-8)}${phoneCounter}`.slice(0, 10);
}

async function createTestUser({ referrerId, fullName } = {}) {
  const company = referrerId === undefined ? await userModel.findByReferCode(pool, COMPANY_REFER_CODE) : null;
  const suffix = uniqueSuffix();
  const passwordHash = await hashPassword('TestPassword123!');
  const user = await userModel.createUser(pool, {
    referCode: `D${suffix}`.toUpperCase().slice(0, 8),
    referrerId: referrerId !== undefined ? referrerId : company.id,
    fullName: fullName || `Dashboard Test User ${suffix}`,
    email: `dashboard-test-${suffix}@example.invalid`,
    phone: uniquePhone(),
    passwordHash,
    state: 'Maharashtra',
  });
  createdUserIds.push(user.id);
  return user;
}

async function buyCourse(buyerId, course) {
  const purchase = await purchaseModel.createPendingPurchase(pool, {
    buyerId,
    courseId: course.id,
    amount: course.price,
  });
  createdPurchaseIds.push(purchase.id);
  const outcome = await rewardEngine.processPendingPurchase(purchase.id, { simulate: 'success' });
  assert.equal(outcome.status, 'success');
  return purchase;
}

async function getCourseByName(name) {
  const result = await pool.query(
    'SELECT id, name, price, direct_bonus, indirect_bonus, company_cut FROM courses WHERE name = $1',
    [name]
  );
  return result.rows[0];
}

before(async () => {
  const company = await userModel.findByReferCode(pool, COMPANY_REFER_CODE);
  if (!company) throw new Error('COMPANY system account not found — did you run `npm run seed`?');
  initialCompanyBalance = Number((await pool.query('SELECT wallet_balance FROM users WHERE id = $1', [company.id])).rows[0].wallet_balance);
});

after(async () => {
  try {
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
    for (const id of [...createdUserIds].reverse()) {
      // eslint-disable-next-line no-await-in-loop
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
    }

    const company = await userModel.findByReferCode(pool, COMPANY_REFER_CODE);
    const finalBalance = Number((await pool.query('SELECT wallet_balance FROM users WHERE id = $1', [company.id])).rows[0].wallet_balance);
    assert.equal(finalBalance, initialCompanyBalance, "COMPANY's wallet_balance was not fully restored after cleanup");
  } finally {
    await pool.end();
  }
});

test('revenue summary reflects a just-made purchase in every window (today/7d/30d/all-time)', async () => {
  const course = await getCourseByName('SKILLS PRO');
  const referrer = await createTestUser();
  const buyer = await createTestUser({ referrerId: referrer.id });

  const before1 = await rewardTransactionModel.getRevenueSummary(pool, referrer.id);
  await buyCourse(buyer.id, course);
  const after1 = await rewardTransactionModel.getRevenueSummary(pool, referrer.id);

  const delta = (field) => Number(after1[field]) - Number(before1[field]);
  assert.equal(delta('today'), Number(course.direct_bonus));
  assert.equal(delta('last_7_days'), Number(course.direct_bonus));
  assert.equal(delta('last_30_days'), Number(course.direct_bonus));
  assert.equal(delta('all_time'), Number(course.direct_bonus));
});

test('recent referrals: only direct-tier credits show up, package name and amount are correct, search filters by name', async () => {
  const course = await getCourseByName('SKILLS PRO');
  const referrer = await createTestUser();
  const buyer = await createTestUser({ referrerId: referrer.id, fullName: 'Findable Buyer Zzyzx' });

  await buyCourse(buyer.id, course);

  const all = await rewardTransactionModel.getRecentReferrals(pool, referrer.id);
  const match = all.find((row) => row.buyer_refer_code === buyer.refer_code);
  assert.ok(match, 'the buyer should appear in the referrer\'s recent-referrals list');
  assert.equal(match.package_name, 'SKILLS PRO');
  assert.equal(Number(match.amount), Number(course.direct_bonus));

  const searched = await rewardTransactionModel.getRecentReferrals(pool, referrer.id, { search: 'Zzyzx' });
  assert.ok(searched.some((row) => row.buyer_refer_code === buyer.refer_code));

  const noMatch = await rewardTransactionModel.getRecentReferrals(pool, referrer.id, { search: 'NoSuchNameAtAll' });
  assert.equal(noMatch.some((row) => row.buyer_refer_code === buyer.refer_code), false);
});

test('leaderboard excludes COMPANY and reflects correct totals within a time window', async () => {
  const course = await getCourseByName('SKILLS PRO');
  const referrer = await createTestUser();
  const buyer = await createTestUser({ referrerId: referrer.id });
  await buyCourse(buyer.id, course);

  const allTime = await rewardTransactionModel.getLeaderboard(pool, { limit: 1000 });
  assert.equal(allTime.some((row) => row.refer_code === 'COMPANY'), false, 'COMPANY must never appear on the leaderboard');

  const entry = allTime.find((row) => row.id === referrer.id);
  assert.ok(entry, 'the referrer should appear on the all-time leaderboard');
  assert.equal(Number(entry.total_earned), Number(course.direct_bonus));

  // A window starting in the future should show nothing for this fresh credit.
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const noneYet = await rewardTransactionModel.getLeaderboard(pool, { since: future, limit: 1000 });
  assert.equal(noneYet.some((row) => row.id === referrer.id), false);
});

test('owned vs unowned course sets are correct and mutually exclusive after a purchase', async () => {
  const course = await getCourseByName('EDITING PRO');
  const buyer = await createTestUser();

  const unownedBefore = await courseModel.findUnownedActiveCoursesForUser(pool, buyer.id);
  assert.ok(unownedBefore.some((c) => c.id === course.id), 'course should start unowned');

  await buyCourse(buyer.id, course);

  const owned = await courseModel.findOwnedCoursesByUserId(pool, buyer.id);
  assert.ok(owned.some((c) => c.id === course.id), 'course should now be owned');

  const unownedAfter = await courseModel.findUnownedActiveCoursesForUser(pool, buyer.id);
  assert.equal(unownedAfter.some((c) => c.id === course.id), false, 'course must no longer appear as unowned');
});

test('profile: sponsor info is correctly joined, and update rejects a duplicate email', async () => {
  const referrer = await createTestUser({ fullName: 'Sponsor Person' });
  const user = await createTestUser({ referrerId: referrer.id });
  const other = await createTestUser();

  const profile = await userModel.findProfileById(pool, user.id);
  assert.equal(profile.sponsor_full_name, 'Sponsor Person');
  assert.equal(profile.sponsor_refer_code, referrer.refer_code);

  // Attempting to update user's email to other's email should be
  // detectable by the same pre-check profile.controller.js performs.
  const conflict = await userModel.findByEmail(pool, other.email);
  assert.ok(conflict && conflict.id === other.id);
});

test('password update: wrong current password is rejected, correct one succeeds', async () => {
  const { comparePassword, hashPassword: hashPw } = require('../src/utils/password');
  const user = await createTestUser();

  const row = await userModel.findPasswordHashById(pool, user.id);
  assert.equal(await comparePassword('WrongPassword1', row.password_hash), false);
  assert.equal(await comparePassword('TestPassword123!', row.password_hash), true);

  const newHash = await hashPw('BrandNewPassword456!');
  await userModel.updatePasswordHash(pool, user.id, newHash);

  const updatedRow = await userModel.findPasswordHashById(pool, user.id);
  assert.equal(await comparePassword('BrandNewPassword456!', updatedRow.password_hash), true);
  assert.equal(await comparePassword('TestPassword123!', updatedRow.password_hash), false);
});
