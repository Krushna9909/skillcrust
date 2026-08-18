/**
 * src/utils/authToken.js
 *
 * Shared JWT + cookie helpers for the (non-admin) user auth flow. Admin
 * auth (Checkpoint 8) is a DELIBERATELY separate mechanism per spec1.md —
 * it will very likely want its own token/cookie naming so a regular
 * user's cookie is never even shaped like an admin's, so this module is
 * NOT reused for admins even though the underlying jsonwebtoken calls
 * would look similar. Flag in checkpoint.md if Checkpoint 8 decides
 * sharing makes sense after all.
 *
 * Cookie is httpOnly + signed (via cookie-parser's `secret`, wired in
 * app.js from COOKIE_SECRET) + the JWT itself is separately signed with
 * JWT_SECRET — two independent signatures, per README's documented auth
 * pattern.
 */

const jwt = require('jsonwebtoken');
const ms = require('ms');
const config = require('../config/env');

const COOKIE_NAME = 'auth_token';

function signUserToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      referCode: user.refer_code,
    },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn }
  );
}

function verifyUserToken(token) {
  // Throws on invalid/expired token — callers (auth.middleware.js) catch.
  return jwt.verify(token, config.auth.jwtSecret);
}

function cookieOptions() {
  return {
    httpOnly: true,
    signed: true,
    secure: config.isProduction,
    // 'lax' allows the cookie to be sent when arriving via a normal top
    // -level navigation (e.g. clicking an affiliate link into a page that
    // then makes an authenticated fetch), while still blocking it on
    // cross-site POSTs — a reasonable default until Checkpoint 10/11's
    // actual frontend origin setup might call for tightening this.
    sameSite: 'lax',
    maxAge: ms(config.auth.jwtExpiresIn),
    path: '/',
  };
}

function setAuthCookie(res, user) {
  res.cookie(COOKIE_NAME, signUserToken(user), cookieOptions());
}

function clearAuthCookie(res) {
  // Options must match what the cookie was SET with (minus maxAge) for
  // the browser to actually clear it.
  const { maxAge, ...clearOptions } = cookieOptions();
  res.clearCookie(COOKIE_NAME, clearOptions);
}

module.exports = {
  COOKIE_NAME,
  signUserToken,
  verifyUserToken,
  setAuthCookie,
  clearAuthCookie,
};
