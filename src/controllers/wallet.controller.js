/**
 * src/controllers/wallet.controller.js
 *
 * Wallet balance, withdrawal request, withdrawal history.
 *
 * The withdrawal request now collects the payout destination (bank or
 * UPI) right here on the wallet page and STOPS at `pending`: funds are
 * reserved, but nothing is sent to the payout provider until an admin
 * approves it from the admin panel (see admin.controller.js's
 * `approveWithdrawal` / `rejectWithdrawal`).
 *
 * KYC gating and input validation live HERE (same layering as
 * purchase.controller.js validating course existence/ownership before
 * calling rewardEngine) — src/services/withdrawalEngine.js only knows
 * about fund reservation + the payout state machine, nothing about KYC.
 */

const { pool } = require('../config/db');
const { createHttpError } = require('../utils/httpError');
const userModel = require('../models/user.model');
const withdrawalModel = require('../models/withdrawal.model');
const kycModel = require('../models/kyc.model');
const withdrawalEngine = require('../services/withdrawalEngine');
const { encryptField } = require('../utils/encryption');

const { serialize } = withdrawalEngine;

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function getWalletBalance(req, res, next) {
  try {
    const balance = await userModel.getWalletBalance(pool, req.user.id);
    return res.status(200).json({ walletBalance: balance });
  } catch (err) {
    return next(err);
  }
}

function buildPayoutDetails(method, body) {
  const holderName = str(body.holderName || body.holder_name);
  const holderEmail = str(body.holderEmail || body.holder_email);

  if (!holderName) {
    throw createHttpError(400, 'Account holder name is required.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(holderEmail)) {
    throw createHttpError(400, 'A valid email address is required.');
  }

  if (method === 'bank') {
    const accountNumber = str(body.accountNumber || body.account_number).replace(/\s+/g, '');
    const ifscCode = str(body.ifscCode || body.ifsc_code).toUpperCase();

    if (!/^\d{9,18}$/.test(accountNumber)) {
      throw createHttpError(400, 'Please enter a valid bank account number.');
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
      throw createHttpError(400, 'Please enter a valid IFSC code.');
    }

    return {
      holderName,
      holderEmail,
      accountNumberEncrypted: encryptField(accountNumber),
      accountNumberLast4: accountNumber.slice(-4),
      ifscCode,
      upiId: null,
    };
  }

  const upiId = str(body.upiId || body.upi_id);
  if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upiId)) {
    throw createHttpError(400, 'Please enter a valid UPI ID (for example name@bank).');
  }

  return {
    holderName,
    holderEmail,
    accountNumberEncrypted: null,
    accountNumberLast4: null,
    ifscCode: null,
    upiId,
  };
}

async function requestWithdrawal(req, res, next) {
  const body = req.body || {};
  const amount = Number(body.amount);
  const method = body.method;

  if (!Number.isFinite(amount) || amount <= 0) {
    return next(createHttpError(400, 'A valid withdrawal amount is required.'));
  }
  if (method !== 'upi' && method !== 'bank') {
    return next(createHttpError(400, 'Withdrawal method must be "upi" or "bank".'));
  }

  try {
    // KYC gating, per spec1.md: "Two withdrawal methods: UPI and Bank
    // Account, each gated behind the respective KYC type being completed."
    if (method === 'bank') {
      if (!(await kycModel.hasTypeA(pool, req.user.id))) {
        return next(createHttpError(
          403,
          'Complete your bank (Type A) KYC before withdrawing to a bank account.'
        ));
      }
    } else if (!(await kycModel.hasTypeB(pool, req.user.id))) {
      return next(createHttpError(
        403,
        'Complete your UPI (Type B) KYC before withdrawing via UPI.'
      ));
    }

    const payoutDetails = buildPayoutDetails(method, body);

    const withdrawal = await withdrawalEngine.createAndReserveWithdrawal({
      userId: req.user.id,
      amount,
      method,
      payoutDetails,
    });

    // 202 Accepted — the request is queued for admin approval, no money
    // has moved yet. The payout provider is only called once an admin
    // approves it.
    return res.status(202).json({ withdrawal: serialize(withdrawal) });
  } catch (err) {
    return next(err);
  }
}

async function getWithdrawalHistory(req, res, next) {
  try {
    const rows = await withdrawalModel.findByUserId(pool, req.user.id);
    return res.status(200).json({ withdrawals: rows.map(serialize) });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getWalletBalance, requestWithdrawal, getWithdrawalHistory };
