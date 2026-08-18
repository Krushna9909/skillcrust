/**
 * src/utils/encryption.js
 *
 * Checkpoint 4's "encryption/masking utility module" deliverable. The AES
 * helpers here are generic (any string field), not KYC-specific — named
 * this way rather than `kycEncryption.js` so a later checkpoint needing
 * to encrypt some other sensitive field doesn't have to either duplicate
 * this or import something named after a domain it isn't part of.
 * `kyc.controller.js` is the only caller today.
 *
 * *** ALGORITHM: AES-256-GCM, not CBC ***
 * GCM is authenticated encryption — it detects tampering/corruption
 * (wrong key, flipped bits, truncated data) at decrypt time via a 16-byte
 * auth tag, rather than silently returning garbage plaintext the way CBC
 * would. spec1.md just says "AES-256"; GCM is the stronger, now-standard
 * choice for that requirement and costs nothing extra to implement.
 *
 * *** STORAGE FORMAT ***
 * Each encrypted column stores a single string:
 *   base64(iv) + ':' + base64(authTag) + ':' + base64(ciphertext)
 * A fresh random 12-byte IV is generated per encryption call (GCM's
 * standard IV size) — never reused, so encrypting the same plaintext
 * twice produces different ciphertext, which is what you want (otherwise
 * two users with the same PAN would have identical ciphertext, leaking
 * that fact even to someone who never gets the key).
 *
 * *** KEY MANAGEMENT ***
 * `AES_ENCRYPTION_KEY` (env var, base64-encoded 32 bytes) is REQUIRED at
 * boot — see src/config/env.js, which exits immediately at startup if
 * it's missing or the wrong length, rather than letting the app run and
 * fail confusingly the first time someone submits KYC. Never hardcoded,
 * per spec1.md's explicit instruction.
 *
 * *** WHAT THIS FILE DELIBERATELY DOES NOT DO ***
 * No function here ever includes the plaintext OR ciphertext value in a
 * thrown error's `.message` — errorHandler.js logs `err.message`
 * unconditionally, so a value-embedding error message would be exactly
 * the kind of accidental log leak spec1.md prohibits. Every error thrown
 * below is a generic, value-free description of what went wrong.
 */

const crypto = require('crypto');
const config = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

function getKey() {
  return Buffer.from(config.encryption.aesKey, 'base64');
}

/**
 * @param {string|number} plaintext
 * @returns {string|null} the `iv:authTag:ciphertext` string to store, or
 *   null if given a nullish input (so callers can pass an optional field
 *   straight through without a separate null-check at every call site)
 */
function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;

  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/**
 * @param {string} stored - value previously returned by `encryptField`
 * @returns {string|null} the original plaintext, or null if given a
 *   nullish input
 * @throws if `stored` is malformed, or if the auth tag doesn't verify
 *   (wrong key, corrupted/tampered data) — the thrown message never
 *   includes any part of `stored` or the (attempted) plaintext.
 */
function decryptField(stored) {
  if (stored === null || stored === undefined) return null;

  const parts = typeof stored === 'string' ? stored.split(':') : [];
  if (parts.length !== 3) {
    throw new Error('encryption.decryptField: stored value is not in the expected iv:authTag:ciphertext format.');
  }
  const [ivB64, tagB64, ctB64] = parts;

  let iv;
  let authTag;
  let ciphertext;
  try {
    iv = Buffer.from(ivB64, 'base64');
    authTag = Buffer.from(tagB64, 'base64');
    ciphertext = Buffer.from(ctB64, 'base64');
  } catch (err) {
    throw new Error('encryption.decryptField: stored value contains invalid base64.');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (err) {
    // GCM auth-tag verification failed — wrong key, or the ciphertext was
    // corrupted/tampered with. Node's own error here never includes the
    // key or ciphertext, so re-throwing a fresh generic message is just
    // for consistency with the rest of this file, not extra safety.
    throw new Error('encryption.decryptField: unable to decrypt/authenticate the stored value.');
  }
}

/**
 * spec1.md: "masked in the UI everywhere except entry and admin view —
 * show only last 4 digits elsewhere." Works on the PLAINTEXT (call this
 * AFTER decryptField, never on the encrypted column value itself — the
 * encrypted value's "last 4 characters" are meaningless base64 noise, not
 * the real last 4 digits of anything).
 *
 * @param {string|number|null} plaintext
 * @returns {string|null}
 */
function maskLast4(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const str = String(plaintext);
  if (str.length <= 4) return '*'.repeat(str.length);
  return '*'.repeat(str.length - 4) + str.slice(-4);
}

module.exports = { encryptField, decryptField, maskLast4 };
