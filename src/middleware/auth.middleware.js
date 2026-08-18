/**
 * src/middleware/auth.middleware.js
 *
 * Real implementation (Checkpoint 2). Reads the JWT from the signed,
 * httpOnly `auth_token` cookie (see utils/authToken.js), verifies it, and
 * — beyond what the stub's header promised — does ONE extra DB lookup to
 * confirm the account is still active.
 *
 * DECISION: that extra lookup (`findAuthStatusById`) costs one indexed
 * primary-key query per authenticated request, which is cheap, but it's a
 * deliberate choice over trusting the JWT payload alone. JWTs default to a
 * 7-day expiry (JWT_EXPIRES_IN) — without this check, an admin
 * deactivating a user (spec1.md's admin "remove/deactivate users" feature,
 * Checkpoint 8) would have NO effect until that user's existing token
 * expired on its own, up to 7 days later. Flag in checkpoint.md if this
 * tradeoff should go the other way (trust the JWT, skip the DB hit) once
 * there's a reason to care about the extra query load.
 *
 * `req.user` is set to `{ id, referCode, isSystemAccount }` — enough for
 * every downstream handler to know who's asking and to exclude/include
 * COMPANY-specific logic, without forcing every route to also know the
 * user's full profile (routes that need more, e.g. Checkpoint 7's
 * dashboard, query for it themselves).
 */

const { pool } = require('../config/db');
const { COOKIE_NAME, verifyUserToken } = require('../utils/authToken');
const { findAuthStatusById } = require('../models/user.model');

async function requireAuth(req, res, next) {
  const token = req.signedCookies && req.signedCookies[COOKIE_NAME];

  if (!token) {
    const err = new Error('Not authenticated.');
    err.statusCode = 401;
    return next(err);
  }

  let payload;
  try {
    payload = verifyUserToken(token);
  } catch (verifyErr) {
    const err = new Error('Session is invalid or has expired. Please log in again.');
    err.statusCode = 401;
    return next(err);
  }

  try {
    const user = await findAuthStatusById(pool, payload.sub);

    if (!user || !user.is_active) {
      // Covers: account deactivated since the token was issued, or the
      // account no longer exists at all — same generic response either
      // way, and clear the now-stale cookie so the browser stops sending it.
      res.clearCookie(COOKIE_NAME, { path: '/' });
      const err = new Error('Account not found or has been deactivated.');
      err.statusCode = 401;
      return next(err);
    }

    req.user = {
      id: user.id,
      referCode: user.refer_code,
      isSystemAccount: user.is_system_account,
    };
    return next();
  } catch (dbErr) {
    return next(dbErr);
  }
}

module.exports = requireAuth;
