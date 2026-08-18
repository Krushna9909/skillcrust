/**
 * src/utils/validators.js
 *
 * Plain validation helpers for auth endpoints. Deliberately not a
 * schema-validation library (Joi/Zod/etc.) — the field set is small and
 * fixed, and keeping this dependency-free matches Checkpoint 0's
 * lean-MVP approach. If validation needs grow a lot in later checkpoints
 * (KYC's PAN/Aadhaar/IFSC regexes in Checkpoint 4 will look a lot like
 * this file), it may be worth reconsidering — flag it then rather than
 * introducing a library for just this one file now.
 *
 * Every function returns a plain string error message, or `null` if the
 * value is valid — callers collect the non-null ones.
 */

const { INDIAN_STATES } = require('./indianStates');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Indian mobile numbers: 10 digits, optionally prefixed with +91 or 0.
// Stored normalized to the bare 10-digit form (see auth.controller.js).
const PHONE_REGEX = /^(?:\+91|91|0)?([6-9]\d{9})$/;
// Refer codes are our own server-generated, uppercase alnum strings (see
// utils/referCode.js) — also accept the seeded 'COMPANY' literal.
const REFER_CODE_REGEX = /^[A-Z0-9]{4,20}$/;

function validateEmail(email) {
  if (!email || typeof email !== 'string') return 'Email is required.';
  if (!EMAIL_REGEX.test(email.trim())) return 'Email is not a valid email address.';
  return null;
}

/**
 * Returns { error } or { normalized } — normalized is the bare 10-digit
 * form with any +91/91/0 prefix stripped, which is what gets stored.
 */
function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return { error: 'Phone number is required.' };
  const match = PHONE_REGEX.exec(phone.trim());
  if (!match) {
    return { error: 'Phone number must be a valid 10-digit Indian mobile number.' };
  }
  return { normalized: match[1] };
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (password.length > 128) return 'Password is too long.';
  return null;
}

function validateFullName(fullName) {
  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    return 'Full name is required.';
  }
  if (fullName.trim().length > 150) return 'Full name is too long.';
  return null;
}

function validateState(state) {
  if (!state || typeof state !== 'string') return 'State is required.';
  if (!INDIAN_STATES.includes(state)) return 'State must be one of the supported Indian states/UTs.';
  return null;
}

function validateReferCode(referCode) {
  // Refer code is OPTIONAL at this layer — a missing/blank code is handled
  // by falling back to COMPANY in the controller, per spec1.md. This
  // function only validates the *shape* of a code that WAS provided, so a
  // request like `referCode: "; DROP TABLE users;"` gets rejected here
  // rather than silently falling through to a "no matching referrer, so
  // use COMPANY" resolution that would mask a malformed-input bug.
  if (referCode === undefined || referCode === null || referCode === '') return null;
  if (typeof referCode !== 'string' || !REFER_CODE_REGEX.test(referCode.trim().toUpperCase())) {
    return 'Refer code format is invalid.';
  }
  return null;
}

module.exports = {
  validateEmail,
  validatePhone,
  validatePassword,
  validateFullName,
  validateState,
  validateReferCode,
};
