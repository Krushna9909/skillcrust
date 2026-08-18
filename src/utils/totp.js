/**
 * src/utils/totp.js
 *
 * Checkpoint 8's TOTP (2FA) helper — thin wrapper around `speakeasy`
 * (spec1.md names this explicitly, with `otplib` as an alternative; kept
 * `speakeasy` since it's the first-named option and both generation and
 * verification round-trip correctly) plus `qrcode` for rendering the
 * setup QR, per spec1.md's Admin Auth section: "generate a secret per
 * admin, store it on the admins table, show as a QR code to scan with an
 * authenticator app."
 *
 * Every function here is pure/stateless — no DB access, no admin-specific
 * knowledge. `adminAuth.controller.js` is the only caller, and owns all
 * the "what do we do with this secret" logic (storing it, deciding when
 * setup counts as complete, etc.).
 */

const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const ISSUER_NAME = 'Affiliate Course Platform Admin';

/**
 * @param {string} adminEmail - shown in the authenticator app's entry
 *   label, so an admin with multiple accounts can tell them apart
 * @returns {{ base32Secret: string, otpauthUrl: string }}
 */
function generateSecret(adminEmail) {
  const secret = speakeasy.generateSecret({
    length: 20,
    name: `${ISSUER_NAME} (${adminEmail})`,
    issuer: ISSUER_NAME,
  });
  return { base32Secret: secret.base32, otpauthUrl: secret.otpauth_url };
}

/**
 * @param {string} otpauthUrl
 * @returns {Promise<string>} a `data:image/png;base64,...` URL the
 *   frontend can drop straight into an `<img src>` — no separate image
 *   file/endpoint needed.
 */
async function generateQrCodeDataUrl(otpauthUrl) {
  return qrcode.toDataURL(otpauthUrl);
}

/**
 * @param {string} base32Secret
 * @param {string} token - the 6-digit code the admin typed in
 * @returns {boolean}
 */
function verifyToken(base32Secret, token) {
  if (!token || typeof token !== 'string' || !/^\d{6}$/.test(token.trim())) {
    return false;
  }
  return speakeasy.totp.verify({
    secret: base32Secret,
    encoding: 'base32',
    token: token.trim(),
    // Allows the code from one time-step before/after the server's own
    // clock — standard tolerance for TOTP, since phone clocks and the
    // server clock are never perfectly in sync.
    window: 1,
  });
}

module.exports = { generateSecret, generateQrCodeDataUrl, verifyToken };
