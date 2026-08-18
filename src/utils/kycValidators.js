/**
 * src/utils/kycValidators.js
 *
 * Split out from src/utils/validators.js rather than added to it —
 * validators.js's own header comment flagged this exact split as worth
 * reconsidering "if validation needs grow a lot in later checkpoints
 * (KYC's PAN/Aadhaar/IFSC regexes in Checkpoint 4 will look a lot like
 * this file)." This checkpoint added 5 new field validators, which felt
 * like enough to warrant its own file rather than growing validators.js
 * further — same lightweight style (plain string-or-null return, no
 * schema library), just grouped by domain.
 *
 * spec1.md: "Basic format validation still enforced at entry: PAN regex,
 * Aadhaar 12-digit pattern, IFSC regex — reject obviously malformed input
 * even though approval is automatic." These are FORMAT checks only, not
 * verification against any real government database (Aadhaar has no
 * public verification API to check against, and PAN verification
 * requires a paid third-party service) — matches spec1.md's own framing
 * ("obviously malformed"), not full identity verification.
 *
 * Every error message here is generic and never embeds the submitted
 * value — required by errorHandler.js's logging constraint (see that
 * file's header) since these messages can end up in a thrown error.
 */

const ACCOUNT_HOLDER_NAME_MIN = 2;
const ACCOUNT_HOLDER_NAME_MAX = 150;
const BANK_NAME_MIN = 2;
const BANK_NAME_MAX = 150;

// Standard Indian PAN format: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
// spec1.md: "Aadhaar 12-digit pattern" — digit-count format check only, no
// Verhoeff checksum validation (there's no public way to verify a real
// Aadhaar number's authenticity anyway).
const AADHAAR_REGEX = /^\d{12}$/;
// Standard IFSC format: 4 letters, literal '0', 6 alphanumeric.
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
// Indian bank account numbers have no single fixed format across banks —
// 9 to 18 digits covers the realistic range and rejects obvious garbage
// (letters, symbols, absurd lengths).
const ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/;
// UPI ID: <handle>@<psp>, e.g. "name@okhdfcbank" or "9876543210@ybl".
const UPI_ID_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

function validateAccountHolderName(value) {
  if (!value || typeof value !== 'string' || value.trim().length < ACCOUNT_HOLDER_NAME_MIN) {
    return 'Account holder name is required.';
  }
  if (value.trim().length > ACCOUNT_HOLDER_NAME_MAX) return 'Account holder name is too long.';
  return null;
}

function validateBankName(value) {
  if (!value || typeof value !== 'string' || value.trim().length < BANK_NAME_MIN) {
    return 'Bank name is required.';
  }
  if (value.trim().length > BANK_NAME_MAX) return 'Bank name is too long.';
  return null;
}

function validateIfscCode(value) {
  if (!value || typeof value !== 'string') return 'IFSC code is required.';
  if (!IFSC_REGEX.test(value.trim().toUpperCase())) {
    return 'IFSC code format is invalid (expected e.g. HDFC0001234).';
  }
  return null;
}

function validateAccountNumber(value) {
  if (!value || typeof value !== 'string') return 'Account number is required.';
  if (!ACCOUNT_NUMBER_REGEX.test(value.trim())) {
    return 'Account number must be 9-18 digits.';
  }
  return null;
}

function validateAadhaar(value) {
  if (!value || typeof value !== 'string') return 'Aadhaar number is required.';
  if (!AADHAAR_REGEX.test(value.trim())) {
    return 'Aadhaar number must be exactly 12 digits.';
  }
  return null;
}

function validatePan(value) {
  if (!value || typeof value !== 'string') return 'PAN number is required.';
  if (!PAN_REGEX.test(value.trim().toUpperCase())) {
    return 'PAN number format is invalid (expected e.g. ABCDE1234F).';
  }
  return null;
}

function validateUpiId(value) {
  if (!value || typeof value !== 'string') return 'UPI ID is required.';
  if (!UPI_ID_REGEX.test(value.trim())) {
    return 'UPI ID format is invalid (expected e.g. name@bank).';
  }
  return null;
}

module.exports = {
  validateAccountHolderName,
  validateBankName,
  validateIfscCode,
  validateAccountNumber,
  validateAadhaar,
  validatePan,
  validateUpiId,
};
