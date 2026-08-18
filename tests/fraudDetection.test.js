/**
 * tests/fraudDetection.test.js
 *
 * Checkpoint 9. Integration tests against a REAL Postgres, same `node:test`
 * pattern as every other DB-backed test file in this project. Creates
 * real users with different `signup_ip` values directly via
 * `userModel.createUser` (bypassing HTTP — this file is testing the
 * detection logic in `fraudDetection.js`/`fraudFlag.model.js`, not
 * Checkpoint 2's signup validation, which already has its own test
 * coverage).
 *
 * *** HOW TO RUN ***
 *   npm run migrate:up && npm run seed && npm test
 *
 * *** CLEANUP ***
 * Every user and fraud_flags row this file creates is tracked and deleted
 * in `after()` — same discipline as every other test file here. Uses
 * distinctive, randomized IP addresses (in the TEST-NET-3 documentation
 * range, RFC 5737, guaranteed never to be a real routable address) so
 * runs never collide with each other or with anything a real request
 * might have produced.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { pool } = require('../src/config/db');
const userModel = require('../src/models/user.model');
const fraudFlagModel = require('../src/models/fraudFlag.model');
const fraudDetection = require('../src/services/fraudDetection');
const { hashPassword } = require('../src/utils/password');
const { COMPANY_REFER_CODE } = require('../src/utils/constants');

const createdUserIds = [];
const createdFlagIds = [];
let phoneCounter = 0;
let companyId;

function uniqueSuffix() {
  return crypto.randomBytes(4).toString('hex');
}

function uniquePhone() {
  phoneCounter += 1;
  return `9${Date.now().toString().slice(-8)}${phoneCounter}`.slice(0, 10);
}

// RFC 5737 TEST-NET-3 (203.0.113.0/24) — reserved for documentation/testing,
// never a real routable address, so these can't collide with anything real.
function testIp() {
  return `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
}

async function createTestUserWithIp(signupIp) {
  const suffix = uniqueSuffix();
  const passwordHash = await hashPassword('TestPassword123!');
  const user = await userModel.createUser(pool, {
    referCode: `F${suffix}`.toUpperCase().slice(0, 8),
    referrerId: companyId,
    fullName: `Fraud Test User ${suffix}`,
    email: `fraud-test-${suffix}@example.invalid`,
    phone: uniquePhone(),
    passwordHash,
    state: 'Maharashtra',
    signupIp,
  });
  createdUserIds.push(user.id);
  return user;
}

before(async () => {
  const company = await userModel.findByReferCode(pool, COMPANY_REFER_CODE);
  if (!company) throw new Error('COMPANY system account not found — did you run `npm run seed`?');
  companyId = company.id;
});

after(async () => {
  try {
    if (createdFlagIds.length > 0) {
      await pool.query('DELETE FROM fraud_flags WHERE id = ANY($1::int[])', [createdFlagIds]);
    }
    for (const id of [...createdUserIds].reverse()) {
      // eslint-disable-next-line no-await-in-loop
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
    }
  } finally {
    await pool.end();
  }
});

test('below threshold: 2 signups from the same IP does not create a flag', async () => {
  const ip = testIp();
  await createTestUserWithIp(ip);
  await createTestUserWithIp(ip);

  const flag = await fraudDetection.checkAndFlagSameIpSignups(ip);
  assert.equal(flag, null);

  const existing = await fraudFlagModel.findRecentFlagForIp(pool, ip, 'same_ip_signup', 24);
  assert.equal(existing, null);
});

test('at threshold: 3 signups from the same IP creates a flag with the correct user_ids', async () => {
  const ip = testIp();
  const u1 = await createTestUserWithIp(ip);
  const u2 = await createTestUserWithIp(ip);
  const u3 = await createTestUserWithIp(ip);

  const flag = await fraudDetection.checkAndFlagSameIpSignups(ip);
  createdFlagIds.push(flag.id);

  assert.equal(flag.flag_type, 'same_ip_signup');
  assert.equal(flag.ip_address, ip);
  assert.deepEqual([...flag.user_ids].sort((a, b) => a - b), [u1.id, u2.id, u3.id].sort((a, b) => a - b));
  assert.equal(flag.details.signupCount, 3);
});

test('dedup: a second check for the same already-flagged IP does not create a duplicate flag', async () => {
  const ip = testIp();
  await createTestUserWithIp(ip);
  await createTestUserWithIp(ip);
  await createTestUserWithIp(ip);

  const firstFlag = await fraudDetection.checkAndFlagSameIpSignups(ip);
  createdFlagIds.push(firstFlag.id);
  assert.ok(firstFlag);

  // A 4th signup from the same IP, then check again — should NOT create a
  // second flag within the dedup window, even though the count is now higher.
  await createTestUserWithIp(ip);
  const secondFlag = await fraudDetection.checkAndFlagSameIpSignups(ip);
  assert.equal(secondFlag, null);

  const allFlagsForIp = await pool.query(
    "SELECT id FROM fraud_flags WHERE ip_address = $1 AND flag_type = 'same_ip_signup'",
    [ip]
  );
  assert.equal(allFlagsForIp.rows.length, 1, 'only the first flag should exist, no duplicate');
});

test('a different IP with its own 3+ signups is flagged independently, unaffected by another IP\'s flag', async () => {
  const ipA = testIp();
  const ipB = testIp();

  await createTestUserWithIp(ipA);
  await createTestUserWithIp(ipA);
  await createTestUserWithIp(ipA);
  const flagA = await fraudDetection.checkAndFlagSameIpSignups(ipA);
  createdFlagIds.push(flagA.id);

  await createTestUserWithIp(ipB);
  await createTestUserWithIp(ipB);
  await createTestUserWithIp(ipB);
  const flagB = await fraudDetection.checkAndFlagSameIpSignups(ipB);
  createdFlagIds.push(flagB.id);

  assert.notEqual(flagA.id, flagB.id);
  assert.equal(flagB.ip_address, ipB);
  assert.equal(flagA.user_ids.some((id) => flagB.user_ids.includes(id)), false, 'the two flags must not share any users');
});

test('a null/undefined IP is a safe no-op, never throws', async () => {
  assert.equal(await fraudDetection.checkAndFlagSameIpSignups(null), null);
  assert.equal(await fraudDetection.checkAndFlagSameIpSignups(undefined), null);
  assert.equal(await fraudDetection.checkAndFlagSameIpSignups(''), null);
});

test('admin listing resolves each flag\'s implicated users (id/name/referCode)', async () => {
  const ip = testIp();
  const u1 = await createTestUserWithIp(ip);
  const u2 = await createTestUserWithIp(ip);
  const u3 = await createTestUserWithIp(ip);

  const flag = await fraudDetection.checkAndFlagSameIpSignups(ip);
  createdFlagIds.push(flag.id);

  const allFlags = await fraudFlagModel.findAllForAdmin(pool);
  const found = allFlags.find((f) => f.id === flag.id);
  assert.ok(found);
  assert.equal(found.users.length, 3);
  const resolvedIds = found.users.map((u) => u.id).sort((a, b) => a - b);
  assert.deepEqual(resolvedIds, [u1.id, u2.id, u3.id].sort((a, b) => a - b));
  assert.ok(found.users.every((u) => typeof u.fullName === 'string' && typeof u.referCode === 'string'));
});
