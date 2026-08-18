/**
 * src/utils/password.js
 *
 * Thin wrapper around bcrypt so every place that hashes/compares a
 * password uses the same salt-round count. `seeds/admins.seed.js` and
 * `seeds/companyAccount.seed.js` (Checkpoint 1) already hard-code
 * `BCRYPT_SALT_ROUNDS = 12` locally rather than importing this — they
 * predate this file and are one-time scripts, not left as an
 * inconsistency to silently "fix" here. New code (this checkpoint's auth
 * controller, and Checkpoint 8's admin login later) should import from
 * here instead of re-declaring the constant.
 */

const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function comparePassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = { hashPassword, comparePassword, SALT_ROUNDS };
