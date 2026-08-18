/**
 * tests/adminAuth.test.js
 *
 * Checkpoint 8. Pure/unit-style tests for the TOTP wrapper
 * (src/utils/totp.js) and the admin JWT token module
 * (src/utils/adminAuthToken.js) — no database needed for these, same
 * category as tests/encryption.test.js. The full end-to-end login → QR
 * setup → 2FA verify → session flow, and `requireAdmin` rejecting a
 * regular user's token, were verified live over real HTTP against a real
 * Postgres — see checkpoint.md's Progress Log for that verification
 * (not duplicated here as an automated test, to avoid this file also
 * needing to drive a full user signup just to get a comparison token).
 *
 * *** HOW TO RUN ***
 *   npm test
 * Needs a valid `.env` (module-load side effect of requiring config/env.js
 * transitively) but does NOT need Postgres actually running for this file
 * specifically.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { generateSecret, verifyToken } = require('../src/utils/totp');
const speakeasy = require('speakeasy');

test('generateSecret produces a base32 secret and a valid otpauth:// URL', () => {
  const { base32Secret, otpauthUrl } = generateSecret('admin@example.com');
  assert.equal(typeof base32Secret, 'string');
  assert.ok(base32Secret.length > 0);
  assert.ok(otpauthUrl.startsWith('otpauth://totp/'));
  assert.ok(otpauthUrl.includes(encodeURIComponent('admin@example.com').replace(/%40/g, '%40') ) || otpauthUrl.includes('admin%40example.com') || otpauthUrl.includes('admin@example.com'));
});

test('verifyToken accepts a freshly-generated valid code and rejects a wrong one', () => {
  const { base32Secret } = generateSecret('admin@example.com');
  const validCode = speakeasy.totp({ secret: base32Secret, encoding: 'base32' });

  assert.equal(verifyToken(base32Secret, validCode), true);
  assert.equal(verifyToken(base32Secret, '000000'), false);
});

test('verifyToken rejects malformed input without throwing (not 6 digits, not a string, empty)', () => {
  const { base32Secret } = generateSecret('admin@example.com');

  assert.equal(verifyToken(base32Secret, '12345'), false); // too short
  assert.equal(verifyToken(base32Secret, '1234567'), false); // too long
  assert.equal(verifyToken(base32Secret, 'abcdef'), false); // not digits
  assert.equal(verifyToken(base32Secret, ''), false);
  assert.equal(verifyToken(base32Secret, null), false);
  assert.equal(verifyToken(base32Secret, undefined), false);
});

test('verifyToken rejects a code generated from a DIFFERENT secret', () => {
  const secretA = generateSecret('a@example.com').base32Secret;
  const secretB = generateSecret('b@example.com').base32Secret;
  const codeForB = speakeasy.totp({ secret: secretB, encoding: 'base32' });

  assert.equal(verifyToken(secretA, codeForB), false);
});

test('generateSecret produces a DIFFERENT secret on every call (never reused)', () => {
  const first = generateSecret('admin@example.com').base32Secret;
  const second = generateSecret('admin@example.com').base32Secret;
  assert.notEqual(first, second);
});

test('adminAuthToken: a pending-2FA token is rejected by verifyAdminSessionToken (cannot skip the 2FA step)', () => {
  const { signPendingTwoFactorToken, verifyAdminSessionToken } = require('../src/utils/adminAuthToken');
  const pendingToken = signPendingTwoFactorToken({ id: 1 });

  assert.throws(() => verifyAdminSessionToken(pendingToken));
});

test('adminAuthToken: a real admin session token verifies and carries the right subject', () => {
  const { signAdminSessionToken, verifyAdminSessionToken } = require('../src/utils/adminAuthToken');
  const token = signAdminSessionToken({ id: 42, email: 'admin@example.com' });
  const payload = verifyAdminSessionToken(token);

  assert.equal(payload.sub, 42);
  assert.equal(payload.email, 'admin@example.com');
});

test('adminAuthToken: a user-style token signed with a different secret cannot be verified as an admin session', () => {
  const jwt = require('jsonwebtoken');
  const config = require('../src/config/env');
  const { verifyAdminSessionToken } = require('../src/utils/adminAuthToken');

  // Forged token using the REGULAR USER secret, not ADMIN_JWT_SECRET —
  // this is exactly what a leaked/reused user JWT_SECRET would produce.
  const forgedToken = jwt.sign({ sub: 1, referCode: 'X' }, config.auth.jwtSecret, { expiresIn: '1h' });

  assert.throws(() => verifyAdminSessionToken(forgedToken));
});
