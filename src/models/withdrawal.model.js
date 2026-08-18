/**
 * src/models/withdrawal.model.js
 *
 * Raw-SQL query functions for the `withdrawals` table (see Checkpoint 1's
 * migration for the schema — `pending -> processing -> paid|failed`,
 * already shaped exactly for this checkpoint, no migration changes
 * needed). Every function here is transaction-agnostic (accepts an
 * explicit `client`, does its own thing, no BEGIN/COMMIT) — all
 * transaction boundaries live in src/services/withdrawalEngine.js, same
 * split as purchase.model.js / rewardEngine.js in Checkpoint 3.
 */

async function createPendingWithdrawal(client, { userId, amount, method }) {
  const result = await client.query(
    `INSERT INTO withdrawals (user_id, amount, method, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id, user_id, amount, method, status, payout_gateway_reference, failure_reason, created_at, updated_at`,
    [userId, amount, method]
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
    `SELECT id, user_id, amount, method, status
     FROM withdrawals WHERE id = $1 AND status = 'pending'
     FOR UPDATE`,
    [id]
  );
  return result.rows[0] || null;
}

async function findProcessingByIdForUpdate(client, id) {
  const result = await client.query(
    `SELECT id, user_id, amount, method, status
     FROM withdrawals WHERE id = $1 AND status = 'processing'
     FOR UPDATE`,
    [id]
  );
  return result.rows[0] || null;
}

async function markProcessing(client, id) {
  const result = await client.query(
    `UPDATE withdrawals SET status = 'processing', updated_at = now()
     WHERE id = $1
     RETURNING id, user_id, amount, method, status, payout_gateway_reference, failure_reason, created_at, updated_at`,
    [id]
  );
  return result.rows[0];
}

async function markPaid(client, id, payoutGatewayReference) {
  const result = await client.query(
    `UPDATE withdrawals
     SET status = 'paid', payout_gateway_reference = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, user_id, amount, method, status, payout_gateway_reference, failure_reason, created_at, updated_at`,
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
     RETURNING id, user_id, amount, method, status, payout_gateway_reference, failure_reason, created_at, updated_at`,
    [id, failureReason]
  );
  return result.rows[0];
}

/**
 * Withdrawal history for the logged-in user's wallet page — newest first.
 * No pagination yet (spec1.md just asks for "withdrawal history log per
 * user," no page-size mentioned) — worth adding if a user's history grows
 * large enough to matter; flag if that's already a concern.
 */
async function findByUserId(client, userId) {
  const result = await client.query(
    `SELECT id, user_id, amount, method, status, payout_gateway_reference, failure_reason, created_at, updated_at
     FROM withdrawals WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Checkpoint 8: admin withdrawal-history visibility (spec1.md's Admin
 * Panel: "Visibility into: ... withdrawal history"). Every withdrawal
 * across every user, joined with basic user identity, newest first. No
 * pagination (spec1.md doesn't call for it here specifically, and
 * withdrawal volume is naturally much lower than user count) — worth
 * revisiting if this grows large.
 */
async function findAllForAdmin(client) {
  const result = await client.query(
    `SELECT
       w.id, w.user_id, u.full_name AS user_full_name, u.refer_code AS user_refer_code,
       w.amount, w.method, w.status, w.payout_gateway_reference, w.failure_reason,
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
  markProcessing,
  markPaid,
  markFailed,
  findByUserId,
  findAllForAdmin,
};
