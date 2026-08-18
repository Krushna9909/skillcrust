/**
 * tests/withdrawalEngine.test.js
 *
 * Checkpoint 5's core money logic, verified the same way Checkpoint 3's
 * reward engine was: integration tests against a REAL Postgres (whatever
 * `DATABASE_URL` points at), using Node's built-in `node:test` (no new
 * dependency). Scoped to src/services/withdrawalEngine.js itself — KYC
 * gating and input validation live in wallet.controller.js and are
 * exercised via live HTTP instead (see checkpoint.md's Progress Log for
 * that verification), not duplicated here, matching how
 * tests/rewardEngine.test.js also stayed scoped to the engine layer.
 *
 * *** HOW TO RUN ***
 *   npm run migrate:up   (if not already done)
 *   npm run seed
 *   npm test
 *
 * *** SAFE TO RUN AGAINST A SHARED/DEV DATABASE ***
 * Unlike tests/rewardEngine.test.js, nothing here ever touches a shared/
 * permanent account (COMPANY plays no role in withdrawals) — every dollar
 * moved in these tests moves between a disposable test user's own wallet
 * and "outside" (the mock payout gateway), so cleanup is simpler: delete
 * the created withdrawals, kyc rows, and users, done. Test users get
 * randomized emails/phones/refer-codes so repeated runs never collide.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { pool } = require('../src/config/db');
const userModel = require('../src/models/user.model');
const kycModel = require('../src/models/kyc.model');
const withdrawalModel = require('../src/models/withdrawal.model');
const withdrawalEngine = require('../src/services/withdrawalEngine');
const { hashPassword } = require('../src/utils/password');
const { encryptField } = require('../src/utils/encryption');
const { COMPANY_REFER_CODE } = require('../src/utils/constants');

const createdUserIds = [];
let phoneCounter = 0;

function uniqueSuffix() {
  return crypto.randomBytes(4).toString('hex');
}

function uniquePhone() {
  phoneCounter += 1;
  return `9${Date.now().toString().slice(-8)}${phoneCounter}`.slice(0, 10);
}

async function createFundedTestUser({ walletBalance }) {
  const company = await userModel.findByReferCode(pool, COMPANY_REFER_CODE);
  const suffix = uniqueSuffix();
  const passwordHash = await hashPassword('TestPassword123!');
  const user = await userModel.createUser(pool, {
    referCode: `W${suffix}`.toUpperCase().slice(0, 8),
    referrerId: company.id,
    fullName: `Withdrawal Test User ${suffix}`,
    email: `withdrawal-test-${suffix}@example.invalid`,
    phone: uniquePhone(),
    passwordHash,
    state: 'Maharashtra',
  });
  createdUserIds.push(user.id);
  await userModel.incrementWalletBalance(pool, user.id, walletBalance);
  return user;
}

async function giveTypeAKyc(userId) {
  await kycModel.upsertTypeA(pool, {
    userId,
    accountHolderName: 'Test Holder',
    ifscCode: 'HDFC0001234',
    bankName: 'HDFC Bank',
    accountNumberEncrypted: encryptField('123456789012'),
    aadhaarNumberEncrypted: encryptField('234567890123'),
    panNumberEncrypted: encryptField('ABCDE1234F'),
  });
}

async function giveTypeBKyc(userId) {
  await kycModel.upsertTypeB(pool, { userId, upiId: 'testuser@okhdfcbank' });
}

async function getBalance(userId) {
  return Number(await userModel.getWalletBalance(pool, userId));
}

before(async () => {
  const company = await userModel.findByReferCode(pool, COMPANY_REFER_CODE);
  if (!company) throw new Error('COMPANY system account not found — did you run `npm run seed`?');
});

after(async () => {
  try {
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM withdrawals WHERE user_id = ANY($1::int[])', [createdUserIds]);
      await pool.query('DELETE FROM kyc_type_a WHERE user_id = ANY($1::int[])', [createdUserIds]);
      await pool.query('DELETE FROM kyc_type_b WHERE user_id = ANY($1::int[])', [createdUserIds]);
    }
    for (const id of [...createdUserIds].reverse()) {
      // eslint-disable-next-line no-await-in-loop
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
    }
  } finally {
    await pool.end();
  }
});

test('successful bank withdrawal: balance deducted, status paid, payout reference present', async () => {
  const user = await createFundedTestUser({ walletBalance: 1000 });
  await giveTypeAKyc(user.id);

  const before1 = await getBalance(user.id);
  const withdrawal = await withdrawalEngine.createAndReserveWithdrawal({
    userId: user.id,
    amount: 400,
    method: 'bank',
  });
  // Reservation happens at creation time — balance should already be down.
  assert.equal(await getBalance(user.id), before1 - 400);

  const outcome = await withdrawalEngine.processPendingWithdrawal(withdrawal.id, { simulate: 'success' });

  assert.equal(outcome.status, 'paid');
  assert.ok(outcome.payoutGatewayReference);
  assert.equal(outcome.failureReason, null);
  assert.equal(await getBalance(user.id), before1 - 400, 'balance should stay reduced after a successful payout');
});

test('successful UPI withdrawal: same reserve-then-payout behavior for the other method', async () => {
  const user = await createFundedTestUser({ walletBalance: 1000 });
  await giveTypeBKyc(user.id);

  const withdrawal = await withdrawalEngine.createAndReserveWithdrawal({
    userId: user.id,
    amount: 250,
    method: 'upi',
  });
  const outcome = await withdrawalEngine.processPendingWithdrawal(withdrawal.id, { simulate: 'success' });

  assert.equal(outcome.status, 'paid');
  assert.equal(await getBalance(user.id), 750);
});

test('insufficient balance: reservation is rejected up front, no withdrawal row, no balance change', async () => {
  const user = await createFundedTestUser({ walletBalance: 100 });
  await giveTypeAKyc(user.id);

  const before1 = await getBalance(user.id);
  await assert.rejects(
    () => withdrawalEngine.createAndReserveWithdrawal({ userId: user.id, amount: 500, method: 'bank' }),
    /Insufficient wallet balance/
  );
  assert.equal(await getBalance(user.id), before1, 'a rejected reservation must not touch the balance');

  const history = await withdrawalModel.findByUserId(pool, user.id);
  assert.equal(history.length, 0, 'no withdrawal row should exist for a rejected reservation');
});

test('failed payout: reserved amount is refunded, status failed, net balance change is zero', async () => {
  const user = await createFundedTestUser({ walletBalance: 1000 });
  await giveTypeAKyc(user.id);

  const before1 = await getBalance(user.id);
  const withdrawal = await withdrawalEngine.createAndReserveWithdrawal({
    userId: user.id,
    amount: 300,
    method: 'bank',
  });
  assert.equal(await getBalance(user.id), before1 - 300, 'balance should be reserved (down) while processing');

  const outcome = await withdrawalEngine.processPendingWithdrawal(withdrawal.id, { simulate: 'failure' });

  assert.equal(outcome.status, 'failed');
  assert.ok(outcome.failureReason);
  assert.equal(outcome.payoutGatewayReference, null);
  assert.equal(await getBalance(user.id), before1, 'a failed payout must fully refund the reserved amount — net zero change');
});

test('processing an already-resolved withdrawal again throws and does NOT double-pay or double-refund', async () => {
  const user = await createFundedTestUser({ walletBalance: 1000 });
  await giveTypeAKyc(user.id);

  const withdrawal = await withdrawalEngine.createAndReserveWithdrawal({
    userId: user.id,
    amount: 200,
    method: 'bank',
  });
  await withdrawalEngine.processPendingWithdrawal(withdrawal.id, { simulate: 'success' });

  const balanceAfterFirstProcess = await getBalance(user.id);
  await assert.rejects(
    () => withdrawalEngine.processPendingWithdrawal(withdrawal.id, { simulate: 'success' }),
    /not pending|resolved concurrently/
  );
  assert.equal(await getBalance(user.id), balanceAfterFirstProcess, 'a rejected re-processing attempt must not change the balance again');
});

test('withdrawal history lists newest first and reflects final status', async () => {
  const user = await createFundedTestUser({ walletBalance: 1000 });
  await giveTypeAKyc(user.id);

  const w1 = await withdrawalEngine.createAndReserveWithdrawal({ userId: user.id, amount: 100, method: 'bank' });
  await withdrawalEngine.processPendingWithdrawal(w1.id, { simulate: 'success' });

  const w2 = await withdrawalEngine.createAndReserveWithdrawal({ userId: user.id, amount: 150, method: 'bank' });
  await withdrawalEngine.processPendingWithdrawal(w2.id, { simulate: 'failure' });

  const history = await withdrawalModel.findByUserId(pool, user.id);
  assert.equal(history.length, 2);
  // Newest first.
  assert.equal(history[0].id, w2.id);
  assert.equal(history[0].status, 'failed');
  assert.equal(history[1].id, w1.id);
  assert.equal(history[1].status, 'paid');
});
