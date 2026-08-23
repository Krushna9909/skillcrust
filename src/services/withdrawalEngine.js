/**
 * src/services/withdrawalEngine.js
 *
 * Checkpoint 5 — the withdrawal-side counterpart to Checkpoint 3's
 * rewardEngine.js, following the same two-phase philosophy: never hold a
 * DB transaction open across the external payout gateway call. Exposes
 * two functions, both called from wallet.controller.js:
 *
 *   1. `createAndReserveWithdrawal({ userId, amount, method })` —
 *      atomically checks-and-deducts the wallet balance, then creates the
 *      `withdrawals` row (status `'pending'`). This is the fund
 *      "reservation" — see below for why it happens BEFORE the gateway
 *      call, not after.
 *   2. `processPendingWithdrawal(withdrawalId, opts)` — transitions
 *      `pending -> processing`, calls the payout gateway (no transaction
 *      held), then finalizes `processing -> paid` (nothing more to do,
 *      the balance was already deducted) or `processing -> failed`
 *      (REFUNDS the deducted amount in the same transaction that marks
 *      it failed).
 *
 * *** WHY RESERVE FUNDS BEFORE CALLING THE GATEWAY, NOT AFTER ***
 * spec1.md: "the wallet balance must NOT be deducted if the payout
 * failed." The naive reading — "just deduct on success, do nothing on
 * failure" — has a real race condition: without SOME atomic hold on the
 * funds at request time, two concurrent withdrawal requests for a user's
 * entire balance could each read a sufficient balance, both proceed to
 * call the gateway, and both succeed — overdrawing the wallet into
 * negative territory. Deducting up front (atomically — see
 * user.model.js's `deductWalletBalanceIfSufficient`, a single
 * WHERE-guarded UPDATE, not a separate check-then-update) closes that
 * race: the SECOND concurrent request's deduction attempt simply fails
 * (0 rows affected) against the already-reduced balance, and is rejected
 * before ever reaching the gateway. A failed payout then REFUNDS the
 * exact amount reserved, so the end state — the only state spec1.md's
 * sentence actually constrains — nets to "not deducted." This is the
 * standard pattern for any system calling an irreversible external
 * operation with real funds on the line, not an invented complication.
 *
 * *** IDEMPOTENCY ***
 * Both `FOR UPDATE`-locked reads in withdrawal.model.js
 * (`findPendingByIdForUpdate` / `findProcessingByIdForUpdate`) exist so a
 * duplicate/concurrent call against the same withdrawal id finds it
 * already past the expected state and throws, rather than transitioning
 * (or refunding) it a second time — same reasoning as Checkpoint 3's
 * reward engine, same real financial stakes.
 */

const { pool } = require('../config/db');
const { createHttpError } = require('../utils/httpError');
const payoutGateway = require('./payout');
const userModel = require('../models/user.model');
const withdrawalModel = require('../models/withdrawal.model');
const config = require('../config/env');
const creatorFeed = require('./creatorFeed');
const { decryptField } = require('../utils/encryption');

/**
 * @param {object} params
 * @param {number} params.userId
 * @param {number|string} params.amount
 * @param {'upi'|'bank'} params.method
 * @returns {Promise<object>} the new withdrawal row (status 'pending')
 * @throws {HttpError} 400 if the wallet balance is insufficient
 */
async function createAndReserveWithdrawal({ userId, amount, method, payoutDetails }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const remainingBalance = await userModel.deductWalletBalanceIfSufficient(client, userId, amount);
    if (remainingBalance === null) {
      throw createHttpError(400, 'Insufficient wallet balance for this withdrawal.');
    }

    const withdrawal = await withdrawalModel.createPendingWithdrawal(client, { userId, amount, method, payoutDetails });

    await client.query('COMMIT');
    return withdrawal;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {number} withdrawalId
 * @param {object} [options]
 * @param {'success'|'failure'|undefined} [options.simulate] - dev/test-only
 *   override, already expected to have been sanitized by the caller (see
 *   src/services/payout/mockGateway.js's `sanitizeSimulateOverride`)
 * @returns {Promise<{
 *   id: number, status: 'paid'|'failed', amount: string, method: string,
 *   payoutGatewayReference: string|null, failureReason: string|null,
 *   createdAt: Date, updatedAt: Date
 * }>}
 */
async function processPendingWithdrawal(withdrawalId, { simulate } = {}) {
  // --- Phase 1: pending -> processing (short transaction) ---------------
  const phase1Client = await pool.connect();
  let withdrawal;
  try {
    await phase1Client.query('BEGIN');

    const locked = await withdrawalModel.findPendingByIdForUpdate(phase1Client, withdrawalId);
    if (!locked) {
      throw new Error(
        `withdrawalEngine.processPendingWithdrawal: withdrawal ${withdrawalId} is not pending ` +
        '(already resolved, or does not exist).'
      );
    }

    withdrawal = await withdrawalModel.markProcessing(phase1Client, withdrawalId);
    await phase1Client.query('COMMIT');
  } catch (err) {
    await phase1Client.query('ROLLBACK');
    throw err;
  } finally {
    phase1Client.release();
  }

  // --- Phase 2: call the payout gateway, no transaction/lock held -------
  const payoutResult = await payoutGateway.payout({
    amount: withdrawal.amount,
    method: withdrawal.method,
    simulate,
  });

  // --- Phase 3: processing -> paid|failed (short transaction) -----------
  const phase3Client = await pool.connect();
  try {
    await phase3Client.query('BEGIN');

    const locked = await withdrawalModel.findProcessingByIdForUpdate(phase3Client, withdrawalId);
    if (!locked) {
      throw new Error(
        `withdrawalEngine.processPendingWithdrawal: withdrawal ${withdrawalId} was resolved ` +
        'concurrently — refusing to finalize it a second time.'
      );
    }

    if (payoutResult.success) {
      const paid = await withdrawalModel.markPaid(phase3Client, withdrawalId, payoutResult.payoutId);
      await phase3Client.query('COMMIT');
      return serialize(paid);
    }

    // Refund the reserved amount — same transaction as the 'failed'
    // transition, so a crash between the two can never leave the balance
    // permanently short without a matching withdrawal record to explain why.
    await userModel.incrementWalletBalance(phase3Client, locked.user_id, locked.amount);
    const failed = await withdrawalModel.markFailed(phase3Client, withdrawalId, payoutResult.failureReason);
    await phase3Client.query('COMMIT');
    return serialize(failed);
  } catch (err) {
    await phase3Client.query('ROLLBACK');
    throw err;
  } finally {
    phase3Client.release();
  }
}

/**
 * Admin approval path (the flow the wallet page now uses): a `pending`
 * withdrawal sits untouched — funds already reserved — until an admin
 * approves it here. On approval we hand the stored payout destination to
 * the external CreatorFeed payout API when it is configured, and fall
 * back to the local mock payout gateway when it is not (dev/test), so
 * the state machine below is identical either way.
 */
async function approveAndPayout(withdrawalId, { simulate } = {}) {
  // --- Phase 1: pending -> processing (short transaction) ---------------
  const phase1Client = await pool.connect();
  let withdrawal;
  try {
    await phase1Client.query('BEGIN');

    const locked = await withdrawalModel.findPendingByIdForUpdate(phase1Client, withdrawalId);
    if (!locked) {
      throw createHttpError(409, 'This withdrawal is no longer pending approval.');
    }

    withdrawal = await withdrawalModel.markProcessing(phase1Client, withdrawalId);
    await phase1Client.query('COMMIT');
  } catch (err) {
    await phase1Client.query('ROLLBACK');
    throw err;
  } finally {
    phase1Client.release();
  }

  // --- Phase 2: call the payout provider, no transaction/lock held ------
  let payoutResult;
  if (config.creatorFeed.apiToken) {
    try {
      const response = await creatorFeed.submitPayoutRequest({
        creator_reference: String(withdrawal.user_id),
        holder_name: withdrawal.holder_name || '',
        holder_email: withdrawal.holder_email || '',
        account_number: withdrawal.account_number_encrypted
          ? decryptField(withdrawal.account_number_encrypted)
          : '',
        ifsc_code: withdrawal.ifsc_code || '',
        upi_id: withdrawal.upi_id || '',
        amount: String(withdrawal.amount),
      });
      payoutResult = {
        success: true,
        payoutId: String(
          (response && (response.payout_id || response.id || response.reference)) || 'creatorfeed'
        ),
      };
    } catch (err) {
      payoutResult = {
        success: false,
        failureReason: 'Payout provider declined this request. Please contact your assigned manager.',
      };
    }
  } else {
    payoutResult = await payoutGateway.payout({
      amount: withdrawal.amount,
      method: withdrawal.method,
      simulate,
    });
  }

  // --- Phase 3: processing -> paid|failed (short transaction) -----------
  const phase3Client = await pool.connect();
  try {
    await phase3Client.query('BEGIN');

    const locked = await withdrawalModel.findProcessingByIdForUpdate(phase3Client, withdrawalId);
    if (!locked) {
      throw createHttpError(409, 'This withdrawal was resolved concurrently.');
    }

    if (payoutResult.success) {
      const paid = await withdrawalModel.markPaid(phase3Client, withdrawalId, payoutResult.payoutId);
      await phase3Client.query('COMMIT');
      return serialize(paid);
    }

    await userModel.incrementWalletBalance(phase3Client, locked.user_id, locked.amount);
    const failed = await withdrawalModel.markFailed(phase3Client, withdrawalId, payoutResult.failureReason);
    await phase3Client.query('COMMIT');
    return serialize(failed);
  } catch (err) {
    await phase3Client.query('ROLLBACK');
    throw err;
  } finally {
    phase3Client.release();
  }
}

/**
 * Admin rejection: mark the pending withdrawal `failed` and refund the
 * reserved amount in the same transaction — nothing ever reaches the
 * payout provider.
 */
async function rejectWithdrawal(withdrawalId, reason) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const locked = await withdrawalModel.findPendingByIdForUpdate(client, withdrawalId);
    if (!locked) {
      throw createHttpError(409, 'This withdrawal is no longer pending approval.');
    }

    await userModel.incrementWalletBalance(client, locked.user_id, locked.amount);
    const failed = await withdrawalModel.markFailed(
      client,
      withdrawalId,
      (reason && String(reason).slice(0, 240)) || 'Rejected by admin.'
    );

    await client.query('COMMIT');
    return serialize(failed);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function serialize(row) {
  return {
    id: row.id,
    status: row.status,
    amount: row.amount,
    method: row.method,
    payoutGatewayReference: row.payout_gateway_reference,
    failureReason: row.failure_reason,
    holderName: row.holder_name,
    holderEmail: row.holder_email,
    accountNumberLast4: row.account_number_last4,
    ifscCode: row.ifsc_code,
    upiId: row.upi_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  createAndReserveWithdrawal,
  processPendingWithdrawal,
  approveAndPayout,
  rejectWithdrawal,
  serialize,
};

