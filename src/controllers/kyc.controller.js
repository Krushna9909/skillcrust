/**
 * src/controllers/kyc.controller.js
 *
 * Checkpoint 4: submit + view KYC. Auto-approved on submit (no review
 * queue — `status` defaults to `'approved'` at the DB level, this
 * controller never sets it to anything else).
 *
 * *** MASKING DECISION — read before changing response shapes ***
 * spec1.md: "masked in the UI everywhere except entry and admin view —
 * show only last 4 digits elsewhere." This controller reads "entry" as
 * the act of the user typing into their own form client-side, NOT as
 * license for the SERVER to echo the full value back in its response —
 * every response from every endpoint below, including the submission
 * responses, returns Aadhaar/PAN/account number masked to last-4-only,
 * with no exception. Rationale: the browser already has the full value
 * in its own form state the instant the user typed it — the server
 * doesn't need to echo it back for the frontend to show a confirmation,
 * and server responses are more likely to end up in browser dev tools,
 * proxy logs, or a support ticket screenshot than a live form field is.
 * This is the STRICTER of two plausible readings of "except entry" —
 * flagged clearly in checkpoint.md in case the intent was for the
 * submission response specifically to echo full values back.
 *
 * `account_holder_name` / `ifsc_code` / `bank_name` are NOT in spec1.md's
 * masked-fields list (only Aadhaar/PAN/account number are) and are
 * returned in full — it's the user's own data, self-service view, not
 * the "admin view" the masking carve-out is about.
 *
 * UPI ID (Type B) is masked too even though spec1.md's masking clause is
 * specifically scoped to Type A's three fields — a small, low-risk
 * extension for consistency, using the same `maskLast4` helper. Flag if
 * you'd rather Type B be returned unmasked.
 */

const { pool } = require('../config/db');
const { createHttpError } = require('../utils/httpError');
const { encryptField, decryptField, maskLast4 } = require('../utils/encryption');
const kycModel = require('../models/kyc.model');
const {
  validateAccountHolderName,
  validateBankName,
  validateIfscCode,
  validateAccountNumber,
  validateAadhaar,
  validatePan,
  validateUpiId,
} = require('../utils/kycValidators');

function serializeTypeA(record, plaintextFields) {
  return {
    status: record.status,
    submittedAt: record.submitted_at,
    updatedAt: record.updated_at,
    accountHolderName: plaintextFields.accountHolderName,
    ifscCode: plaintextFields.ifscCode,
    bankName: plaintextFields.bankName,
    accountNumberMasked: maskLast4(plaintextFields.accountNumber),
    aadhaarNumberMasked: maskLast4(plaintextFields.aadhaarNumber),
    panNumberMasked: maskLast4(plaintextFields.panNumber),
  };
}

function serializeTypeB(record, plaintextUpiId) {
  return {
    status: record.status,
    submittedAt: record.submitted_at,
    updatedAt: record.updated_at,
    upiIdMasked: maskLast4(plaintextUpiId),
  };
}

async function submitBankKyc(req, res, next) {
  const body = req.body || {};

  const errors = [];
  const holderErr = validateAccountHolderName(body.accountHolderName);
  if (holderErr) errors.push(holderErr);
  const ifscErr = validateIfscCode(body.ifscCode);
  if (ifscErr) errors.push(ifscErr);
  const bankErr = validateBankName(body.bankName);
  if (bankErr) errors.push(bankErr);
  const accountErr = validateAccountNumber(body.accountNumber);
  if (accountErr) errors.push(accountErr);
  const aadhaarErr = validateAadhaar(body.aadhaarNumber);
  if (aadhaarErr) errors.push(aadhaarErr);
  const panErr = validatePan(body.panNumber);
  if (panErr) errors.push(panErr);

  if (errors.length > 0) {
    return next(createHttpError(400, errors.join(' ')));
  }

  const accountHolderName = body.accountHolderName.trim();
  const ifscCode = body.ifscCode.trim().toUpperCase();
  const bankName = body.bankName.trim();
  const accountNumber = body.accountNumber.trim();
  const aadhaarNumber = body.aadhaarNumber.trim();
  const panNumber = body.panNumber.trim().toUpperCase();

  try {
    const record = await kycModel.upsertTypeA(pool, {
      userId: req.user.id,
      accountHolderName,
      ifscCode,
      bankName,
      accountNumberEncrypted: encryptField(accountNumber),
      aadhaarNumberEncrypted: encryptField(aadhaarNumber),
      panNumberEncrypted: encryptField(panNumber),
    });

    return res.status(200).json({
      kycTypeA: serializeTypeA(record, {
        accountHolderName,
        ifscCode,
        bankName,
        accountNumber,
        aadhaarNumber,
        panNumber,
      }),
    });
  } catch (err) {
    return next(err);
  }
}

async function submitUpiKyc(req, res, next) {
  const body = req.body || {};

  const upiErr = validateUpiId(body.upiId);
  if (upiErr) return next(createHttpError(400, upiErr));

  const upiId = body.upiId.trim();

  try {
    const record = await kycModel.upsertTypeB(pool, { userId: req.user.id, upiId });
    return res.status(200).json({ kycTypeB: serializeTypeB(record, upiId) });
  } catch (err) {
    return next(err);
  }
}

async function getKycStatus(req, res, next) {
  try {
    const [typeA, typeB] = await Promise.all([
      kycModel.findTypeAByUserId(pool, req.user.id),
      kycModel.findTypeBByUserId(pool, req.user.id),
    ]);

    const response = { kycTypeA: null, kycTypeB: null };

    if (typeA) {
      response.kycTypeA = serializeTypeA(typeA, {
        accountHolderName: typeA.account_holder_name,
        ifscCode: typeA.ifsc_code,
        bankName: typeA.bank_name,
        accountNumber: decryptField(typeA.account_number_encrypted),
        aadhaarNumber: decryptField(typeA.aadhaar_number_encrypted),
        panNumber: decryptField(typeA.pan_number_encrypted),
      });
    }

    if (typeB) {
      response.kycTypeB = serializeTypeB(typeB, typeB.upi_id);
    }

    return res.status(200).json(response);
  } catch (err) {
    return next(err);
  }
}

module.exports = { submitBankKyc, submitUpiKyc, getKycStatus };
