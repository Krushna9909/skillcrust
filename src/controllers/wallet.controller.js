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
const config = require('../config/env');
const { createHttpError } = require('../utils/httpError');
const userModel = require('../models/user.model');
const withdrawalModel = require('../models/withdrawal.model');
const kycModel = require('../models/kyc.model');
const withdrawalEngine = require('../services/withdrawalEngine');
const { decryptField } = require('../utils/encryption');

const { serialize } = withdrawalEngine;


async function getWalletBalance(req, res, next) {
  try {
    const balance = await userModel.getWalletBalance(pool, req.user.id);
    return res.status(200).json({ walletBalance: balance });
  } catch (err) {
    return next(err);
  }
}

/**
 * Payout destination now comes from the person's already-verified KYC
 * record instead of being re-typed on the wallet page: Type A (bank) for
 * `method === 'bank'`, Type B (UPI) for `method === 'upi'`. The wallet
 * form only asks for the amount. This removes the "typed a wrong account
 * number on the payout form" failure mode entirely — the money can only
 * go to the account that was KYC-verified.
 */
async function buildPayoutDetailsFromKyc(userId, method) {
  const user = await userModel.findSafeById(pool, userId);
  if (!user) {
    throw createHttpError(404, 'User not found.');
  }

  if (method === 'bank') {
    const kyc = await kycModel.findTypeAByUserId(pool, userId);
    if (!kyc) {
      throw createHttpError(403, 'Complete your bank (Type A) KYC before withdrawing to a bank account.');
    }
    const accountNumber = decryptField(kyc.account_number_encrypted);
    return {
      holderName: kyc.account_holder_name || user.full_name,
      holderEmail: user.email,
      accountNumberEncrypted: kyc.account_number_encrypted,
      accountNumberLast4: String(accountNumber).slice(-4),
      ifscCode: kyc.ifsc_code,
      upiId: null,
    };
  }

  const kycB = await kycModel.findTypeBByUserId(pool, userId);
  if (!kycB) {
    throw createHttpError(403, 'Complete your UPI (Type B) KYC before withdrawing via UPI.');
  }
  return {
    holderName: user.full_name,
    holderEmail: user.email,
    accountNumberEncrypted: null,
    accountNumberLast4: null,
    ifscCode: null,
    upiId: kycB.upi_id,
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

    const payoutDetails = await buildPayoutDetailsFromKyc(req.user.id, method);

    const withdrawal = await withdrawalEngine.createAndReserveWithdrawal({
      userId: req.user.id,
      amount,
      method,
      payoutDetails,
    });

    // Demo / mock mode (no real payout provider configured): settle the
    // payout immediately so the amount leaves the wallet and the payout
    // shows up as `paid` in the history right away. With a real provider
    // configured we keep the admin-approval flow (202 Accepted).
    if (!config.creatorFeed.apiToken) {
      const settled = await withdrawalEngine.processPendingWithdrawal(withdrawal.id, {
        simulate: 'success',
      });
      const walletBalance = await userModel.getWalletBalance(pool, req.user.id);
      return res.status(200).json({ withdrawal: settled, walletBalance });
    }

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
