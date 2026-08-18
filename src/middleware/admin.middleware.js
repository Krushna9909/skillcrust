/**
 * src/middleware/admin.middleware.js
 *
 * Real implementation (Checkpoint 8). Mirrors the shape of
 * `auth.middleware.js` (verify JWT from a signed httpOnly cookie, then one
 * DB lookup to confirm the account is still real) but is otherwise
 * completely independent — different cookie, different secret, different
 * table (see src/utils/adminAuthToken.js's file header for the full
 * reasoning on why these are kept separate rather than shared).
 *
 * A regular user's token is rejected here by construction, not by an
 * explicit check: this reads `req.signedCookies[admin_auth_token]`, which
 * a normal user session never sets (user sessions only ever set
 * `auth_token` — see authToken.js). Even in the contrived case of an
 * attacker manually forging a cookie named `admin_auth_token`, it would
 * still fail `verifyAdminSessionToken` unless signed with
 * `ADMIN_JWT_SECRET`, which is a distinct value from `JWT_SECRET`
 * (enforced at boot — see config/env.js's `assertAdminSecretIsDistinct`).
 *
 * Sets `req.admin = { id, email }`.
 */

const { pool } = require('../config/db');
const {
  COOKIE_NAME,
  verifyAdminSessionToken,
  clearAdminSessionCookie,
} = require('../utils/adminAuthToken');
const adminModel = require('../models/admin.model');

async function requireAdmin(req, res, next) {
  const token = req.signedCookies && req.signedCookies[COOKIE_NAME];

  if (!token) {
    const err = new Error('Not authenticated as an admin.');
    err.statusCode = 401;
    return next(err);
  }

  let payload;
  try {
    payload = verifyAdminSessionToken(token);
  } catch (verifyErr) {
    const err = new Error('Admin session is invalid or has expired. Please log in again.');
    err.statusCode = 401;
    return next(err);
  }

  try {
    const admin = await adminModel.findAuthStatusById(pool, payload.sub);

    if (!admin) {
      // Admin row no longer exists (shouldn't normally happen — there's
      // no admin-deletion flow — but handled the same defensive way
      // auth.middleware.js handles a deleted user).
      clearAdminSessionCookie(res);
      const err = new Error('Admin account not found.');
      err.statusCode = 401;
      return next(err);
    }

    req.admin = { id: admin.id, email: admin.email };
    return next();
  } catch (dbErr) {
    return next(dbErr);
  }
}

module.exports = requireAdmin;
