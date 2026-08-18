/**
 * src/controllers/adminAuth.controller.js
 *
 * Checkpoint 8's two-step admin login, matching spec1.md's Admin Auth
 * section exactly: "Login flow: email + password, then prompt for the
 * 6-digit TOTP code before issuing the JWT." Two endpoints, matching the
 * two routes CP0 pre-stubbed from the start:
 *
 *   POST /admin/login          — step 1: email + password
 *   POST /admin/login/verify-2fa — step 2: 6-digit TOTP code
 *
 * See src/utils/adminAuthToken.js's file header for the two-token-type
 * design (pending-2FA token vs. the real admin session token) that makes
 * this two-step flow secure — step 1 alone never grants access to any
 * `/admin/*` route.
 *
 * *** FIRST-TIME 2FA SETUP ***
 * spec1.md: "One-time setup screen: generate a secret per admin, store it
 * on the admins table, show as a QR code to scan." There's no separate
 * "setup" endpoint — `login` itself detects `totp_enabled === false` and
 * returns a QR code instead of just a "enter your code" prompt; the admin
 * then completes setup by submitting the code from their freshly-scanned
 * QR to the SAME `verify-2fa` endpoint, which also flips `totp_enabled`
 * to true on success. One flow handles both "first time" and "every time
 * after" — the only difference is whether `requiresSetup` came back true.
 * A fresh secret is generated on every login attempt while
 * `totp_enabled` is still false (see admin.model.js's `setTotpSecret`
 * comment) so an old, unscanned QR code never lingers as valid.
 */

const { pool } = require('../config/db');
const { createHttpError } = require('../utils/httpError');
const { comparePassword } = require('../utils/password');
const { validateEmail } = require('../utils/validators');
const { generateSecret, generateQrCodeDataUrl, verifyToken } = require('../utils/totp');
const {
  PENDING_2FA_COOKIE_NAME,
  setPendingTwoFactorCookie,
  clearPendingTwoFactorCookie,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  verifyPendingTwoFactorToken,
} = require('../utils/adminAuthToken');
const adminModel = require('../models/admin.model');

async function login(req, res, next) {
  const body = req.body || {};

  const emailErr = validateEmail(body.email);
  if (emailErr) return next(createHttpError(400, emailErr));
  if (!body.password || typeof body.password !== 'string') {
    return next(createHttpError(400, 'Password is required.'));
  }

  const email = body.email.trim().toLowerCase();
  // Single generic message for both "no such admin" and "wrong password" —
  // same anti-enumeration reasoning as the regular user login.
  const invalidCredentials = () => createHttpError(401, 'Invalid email or password.');

  try {
    const admin = await adminModel.findByEmail(pool, email);
    if (!admin) {
      return next(invalidCredentials());
    }

    const passwordMatches = await comparePassword(body.password, admin.password_hash);
    if (!passwordMatches) {
      return next(invalidCredentials());
    }

    setPendingTwoFactorCookie(res, admin);

    if (!admin.totp_enabled) {
      const { base32Secret, otpauthUrl } = generateSecret(admin.email);
      await adminModel.setTotpSecret(pool, admin.id, base32Secret);
      const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUrl);

      return res.status(200).json({
        requiresSetup: true,
        qrCodeDataUrl,
        otpauthUrl,
        message:
          'Scan the QR code with an authenticator app, then submit the 6-digit code ' +
          'to POST /admin/login/verify-2fa to finish setup and log in.',
      });
    }

    return res.status(200).json({
      requiresSetup: false,
      message: 'Enter your 6-digit authenticator code via POST /admin/login/verify-2fa.',
    });
  } catch (err) {
    return next(err);
  }
}

async function verifyTwoFactor(req, res, next) {
  const body = req.body || {};
  const pendingToken = req.signedCookies && req.signedCookies[PENDING_2FA_COOKIE_NAME];

  if (!pendingToken) {
    return next(createHttpError(401, 'No pending login session — please log in again.'));
  }
  if (!body.code || typeof body.code !== 'string') {
    return next(createHttpError(400, 'A 6-digit authenticator code is required.'));
  }

  let payload;
  try {
    payload = verifyPendingTwoFactorToken(pendingToken);
  } catch (verifyErr) {
    clearPendingTwoFactorCookie(res);
    return next(createHttpError(401, 'Login session has expired — please log in again.'));
  }

  try {
    const admin = await adminModel.findById(pool, payload.sub);
    if (!admin || !admin.totp_secret) {
      clearPendingTwoFactorCookie(res);
      return next(createHttpError(401, 'No 2FA setup found for this session — please log in again.'));
    }

    const codeIsValid = verifyToken(admin.totp_secret, body.code);
    if (!codeIsValid) {
      return next(createHttpError(401, 'Invalid authenticator code.'));
    }

    if (!admin.totp_enabled) {
      await adminModel.markTotpEnabled(pool, admin.id);
    }

    clearPendingTwoFactorCookie(res);
    setAdminSessionCookie(res, admin);

    return res.status(200).json({ admin: { id: admin.id, email: admin.email } });
  } catch (err) {
    return next(err);
  }
}

/**
 * Not one of CP0's originally-stubbed routes — added for symmetry with
 * the regular user auth flow's `POST /auth/logout` (trivial, low-risk:
 * just clears the session cookie). Flagged in checkpoint.md.
 */
async function logout(req, res) {
  clearAdminSessionCookie(res);
  return res.status(200).json({ message: 'Logged out.' });
}

module.exports = { login, verifyTwoFactor, logout };
