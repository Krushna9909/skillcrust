/**
 * src/models/withdrawal.model.js
 *
 * Raw-SQL query functions for the `withdrawals` table (see Checkpoint 1's
 * migration for the schema — `pending -> processing -> paid|failed`, plus
 * migration 1700000013000 which adds the payout-destination columns the
 * wallet form now collects). Every function here is transaction-agnostic
 * (accepts an explicit `client`, does its own thing, no BEGIN/COMMIT) —
 * all transaction boundaries live in src/services/withdrawalEngine.js,
 * same split as purchase.model.js / rewardEngine.js in Checkpoint 3.
 *
 * `pending` now means "waiting for admin approval": the funds are already
 * reserved, but nothing is sent to the payout provider until an admin
 * approves it (src/controllers/admin.controller.js).
 */

const RETURNING = `id, user_id, amount, method, status, payout_gateway_reference, failure_reason,
   holder_name, holder_email, account_number_encrypted, account_number_last4, ifsc_code, upi_id,
   created_at, updated_at`;

async function createPendingWithdrawal(client, { userId, amount, method, payoutDetails = {} }) {
  const result = await client.query(
    `INSERT INTO withdrawals
       (user_id, amount, method, status, holder_name, holder_email,
        account_number_encrypted, account_number_last4, ifsc_code, upi_id)
     VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9)
     RETURNING ${RETURNING}`,
    [
      userId,
      amount,
      method,
      payoutDetails.holderName || null,
      payoutDetails.holderEmail || null,
      payoutDetails.accountNumberEncrypted || null,
      payoutDetails.accountNumberLast4 || null,
      payoutDetails.ifscCode || null,
      payoutDetails.upiId || null,
    ]
  );
  return result.rows[0];
}

/**
 * Row-locking read for the `pending -> processing` transition — see
 * withdrawalEngine.js's file header for why this (and
 * `findProcessingByIdForUpdate` below) exist: they're what makes
 * double-processing the same withdrawal impossible, the same idempotency
 * pattern Checkpoint 3's reward engine uses for purchases.
 */
async function findPendingByIdForUpdate(client, id) {
  const result = await client.query(
    `SELECT ${RETURNING}
     FROM withdrawals WHERE id = $1 AND status = 'pending'
     FOR UPDATE`,
    [id]
  );
  return result.rows[0] || null;
}

async function findProcessingByIdForUpdate(client, id) {
  const result = await client.query(
    `SELECT ${RETURNING}
     FROM withdrawals WHERE id = $1 AND status = 'processing'
     FOR UPDATE`,
    [id]
  );
  return result.rows[0] || null;
}

async function findById(client, id) {
  const result = await client.query(
    `SELECT ${RETURNING} FROM withdrawals WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function markProcessing(client, id) {
  const result = await client.query(
    `UPDATE withdrawals SET status = 'processing', updated_at = now()
     WHERE id = $1
     RETURNING ${RETURNING}`,
    [id]
  );
  return result.rows[0];
}

async function markPaid(client, id, payoutGatewayReference) {
  const result = await client.query(
    `UPDATE withdrawals
     SET status = 'paid', payout_gateway_reference = $2, updated_at = now()
     WHERE id = $1
     RETURNING ${RETURNING}`,
    [id, payoutGatewayReference]
  );
  return result.rows[0];
}

/**
 * The wallet-balance REFUND that must accompany this (spec1.md: "the
 * wallet balance must NOT be deducted if the payout failed") happens in
 * withdrawalEngine.js via user.model.js's `incrementWalletBalance`, in
 * the SAME transaction as this UPDATE — not this function's job.
 */
async function markFailed(client, id, failureReason) {
  const result = await client.query(
    `UPDATE withdrawals
     SET status = 'failed', failure_reason = $2, updated_at = now()
     WHERE id = $1
     RETURNING ${RETURNING}`,
    [id, failureReason]
  );
  return result.rows[0];
}

/**
 * Withdrawal history for the logged-in user's wallet page — newest first.
 */
async function findByUserId(client, userId) {
  const result = await client.query(
    `SELECT ${RETURNING}
     FROM withdrawals WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Checkpoint 8: admin withdrawal-history visibility. Every withdrawal
 * across every user, joined with basic user identity, newest first — now
 * also carrying the payout destination the admin reviews before
 * approving.
 */
async function findAllForAdmin(client) {
  const result = await client.query(
    `SELECT
       w.id, w.user_id, u.full_name AS user_full_name, u.refer_code AS user_refer_code,
       w.amount, w.method, w.status, w.payout_gateway_reference, w.failure_reason,
       w.holder_name, w.holder_email, w.account_number_last4, w.ifsc_code, w.upi_id,
       w.created_at, w.updated_at
     FROM withdrawals w
     JOIN users u ON u.id = w.user_id
     ORDER BY w.created_at DESC`
  );
  return result.rows;
}

module.exports = {
  createPendingWithdrawal,
  findPendingByIdForUpdate,
  findProcessingByIdForUpdate,
  findById,
  markProcessing,
  markPaid,
  markFailed,
  findByUserId,
  findAllForAdmin,
};
