/**
 * src/utils/adminAuthToken.js
 *
 * Checkpoint 8. `src/utils/authToken.js` (the regular-user version)
 * flagged this exact decision back in Checkpoint 2: "it will very likely
 * want its own token/cookie naming so a regular user's cookie is never
 * even shaped like an admin's." Decision made: yes — fully separate
 * secret (`ADMIN_JWT_SECRET`, not `JWT_SECRET`), separate cookie name
 * (`admin_auth_token`, not `auth_token`), separate expiry
 * (`ADMIN_JWT_EXPIRES_IN`, defaulting shorter than a regular user's 7
 * days — admins can view all financial/KYC data, so a shorter session
 * felt worth the minor inconvenience; not spec-mandated, flag if you'd
 * rather match the user default). A regular user's token can never be
 * mistaken for an admin's: different cookie name entirely means
 * `requireAdmin` (admin.middleware.js) never even looks at a user's
 * cookie, and different secret means even a same-named cookie couldn't
 * verify.
 *
 * *** TWO TOKEN TYPES, ONE MODULE ***
 * spec1.md's login flow is two steps — email+password, THEN a 6-digit
 * TOTP code — matching the two pre-stubbed routes (`/admin/login`,
 * `/admin/login/verify-2fa`). This module issues two DIFFERENT token/
 * cookie pairs for the two stages:
 *   1. `signPendingTwoFactorToken` / `PENDING_2FA_COOKIE_NAME` — issued
 *      right after password verification succeeds, short-lived (5 min),
 *      carries `stage: 'pending_2fa'`. Proves "this browser just proved
 *      it knows the password" without yet being a real session.
 *   2. `signAdminSessionToken` / `COOKIE_NAME` — issued only after the
 *      TOTP code also verifies. This is the real admin session used by
 *      `requireAdmin` for every other `/admin/*` route.
 * The pending-2FA token is deliberately NOT sufficient on its own to
 * pass `requireAdmin` — see that middleware's check for the `stage`
 * claim's absence.
 */

const jwt = require('jsonwebtoken');
const ms = require('ms');
const config = require('../config/env');

const COOKIE_NAME = 'admin_auth_token';
const PENDING_2FA_COOKIE_NAME = 'admin_pending_2fa_token';
const PENDING_2FA_EXPIRES_IN = '5m';

function signAdminSessionToken(admin) {
  return jwt.sign(
    { sub: admin.id, email: admin.email },
    config.adminAuth.jwtSecret,
    { expiresIn: config.adminAuth.jwtExpiresIn }
  );
}

function verifyAdminSessionToken(token) {
  const payload = jwt.verify(token, config.adminAuth.jwtSecret);
  if (payload.stage === 'pending_2fa') {
    // A pending-2FA token structurally could never reach here in normal
    // operation (it's set on a different cookie name), but reject it
    // explicitly anyway — defense in depth against the two cookies ever
    // being confused by a future change.
    throw new Error('Token is a pending-2FA token, not a completed admin session.');
  }
  return payload;
}

function signPendingTwoFactorToken(admin) {
  return jwt.sign(
    { sub: admin.id, stage: 'pending_2fa' },
    config.adminAuth.jwtSecret,
    { expiresIn: PENDING_2FA_EXPIRES_IN }
  );
}

function verifyPendingTwoFactorToken(token) {
  const payload = jwt.verify(token, config.adminAuth.jwtSecret);
  if (payload.stage !== 'pending_2fa') {
    throw new Error('Token is not a pending-2FA token.');
  }
  return payload;
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    signed: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
  };
}

function setAdminSessionCookie(res, admin) {
  res.cookie(COOKIE_NAME, signAdminSessionToken(admin), {
    ...baseCookieOptions(),
    maxAge: ms(config.adminAuth.jwtExpiresIn),
  });
}

function clearAdminSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, baseCookieOptions());
}

function setPendingTwoFactorCookie(res, admin) {
  res.cookie(PENDING_2FA_COOKIE_NAME, signPendingTwoFactorToken(admin), {
    ...baseCookieOptions(),
    maxAge: ms(PENDING_2FA_EXPIRES_IN),
  });
}

function clearPendingTwoFactorCookie(res) {
  res.clearCookie(PENDING_2FA_COOKIE_NAME, baseCookieOptions());
}

module.exports = {
  COOKIE_NAME,
  PENDING_2FA_COOKIE_NAME,
  signAdminSessionToken,
  verifyAdminSessionToken,
  signPendingTwoFactorToken,
  verifyPendingTwoFactorToken,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  setPendingTwoFactorCookie,
  clearPendingTwoFactorCookie,
};
