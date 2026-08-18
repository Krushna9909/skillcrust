/**
 * src/controllers/wallet.controller.js
 *
 * Checkpoint 5: wallet balance, withdrawal request, withdrawal history.
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
const payoutGateway = require('../services/payout');

const { serialize } = withdrawalEngine;

async function getWalletBalance(req, res, next) {
  try {
    const balance = await userModel.getWalletBalance(pool, req.user.id);
    return res.status(200).json({ walletBalance: balance });
  } catch (err) {
    return next(err);
  }
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

    const simulate = payoutGateway.sanitizeSimulateOverride(body.simulate);

    const withdrawal = await withdrawalEngine.createAndReserveWithdrawal({
      userId: req.user.id,
      amount,
      method,
    });

    const outcome = await withdrawalEngine.processPendingWithdrawal(withdrawal.id, { simulate });

    // 201 for a confirmed payout; 402 Payment Required for a declined one
    // — same convention purchase.controller.js uses for the payment
    // side. Body always carries the full status/failureReason regardless.
    const statusCode = outcome.status === 'paid' ? 201 : 402;
    return res.status(statusCode).json({ withdrawal: outcome });
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
