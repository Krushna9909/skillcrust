/**
 * src/models/purchase.model.js
 *
 * Checkpoint 2 needed just `createPendingPurchase`. Checkpoint 3 adds
 * everything needed to actually resolve a pending purchase: fetching it
 * (with/without a row lock), transitioning it to success/failed, and
 * checking prior ownership before letting someone buy a course twice.
 * Nothing in this file touches `reward_transactions` or
 * `users.wallet_balance` directly — that composition happens one layer up
 * in src/services/rewardEngine.js, which calls these functions plus
 * user.model.js's and rewardTransaction.model.js's.
 */

async function createPendingPurchase(client, { buyerId, courseId, amount }) {
  const result = await client.query(
    `INSERT INTO purchases (buyer_id, course_id, amount, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id, buyer_id, course_id, amount, status, created_at`,
    [buyerId, courseId, amount]
  );
  return result.rows[0];
}

/**
 * Plain (non-locking) read — safe to call outside a transaction, used by
 * rewardEngine.js's first pass to grab the purchase's buyer/course/amount
 * BEFORE calling out to the payment gateway (deliberately outside any open
 * DB transaction/lock — see rewardEngine.js's file header for why).
 */
async function findPendingById(client, id) {
  const result = await client.query(
    `SELECT id, buyer_id, course_id, amount, status
     FROM purchases WHERE id = $1 AND status = 'pending'`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Same as `findPendingById`, but with `FOR UPDATE` — used for the SECOND
 * pass, right before writing the final outcome, so two concurrent attempts
 * to resolve the SAME pending purchase (e.g. a double-submitted request)
 * can't both proceed past this point and double-credit rewards. MUST be
 * called inside an open transaction (the lock is released on
 * COMMIT/ROLLBACK).
 */
async function findPendingByIdForUpdate(client, id) {
  const result = await client.query(
    `SELECT id, buyer_id, course_id, amount, status
     FROM purchases WHERE id = $1 AND status = 'pending'
     FOR UPDATE`,
    [id]
  );
  return result.rows[0] || null;
}

async function markSuccess(client, id, paymentGatewayReference) {
  const result = await client.query(
    `UPDATE purchases
     SET status = 'success', payment_gateway_reference = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, buyer_id, course_id, amount, status, payment_gateway_reference, updated_at`,
    [id, paymentGatewayReference]
  );
  return result.rows[0];
}

/**
 * `failureReason` is stored in `payment_gateway_reference` for now — the
 * column is a generic "whatever the gateway told us" slot (see Checkpoint
 * 1's migration comment: "kept generic so a real gateway's transaction ID
 * slots in here later"), and a failed charge has no transaction ID to put
 * there instead, just a reason. Revisit if a later checkpoint wants a
 * dedicated `failure_reason` column on `purchases` (withdrawals already
 * has one, purchases currently doesn't).
 */
async function markFailed(client, id, failureReason) {
  const result = await client.query(
    `UPDATE purchases
     SET status = 'failed', payment_gateway_reference = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, buyer_id, course_id, amount, status, payment_gateway_reference, updated_at`,
    [id, failureReason]
  );
  return result.rows[0];
}

/**
 * Ownership check for the "buy an additional course" endpoint — a course
 * is owned iff there's a successful purchase for it (Checkpoint 1's
 * decision; see migrations/..._create-purchases-table.js).
 */
async function hasSuccessfulPurchase(client, buyerId, courseId) {
  const result = await client.query(
    `SELECT 1 FROM purchases WHERE buyer_id = $1 AND course_id = $2 AND status = 'success'`,
    [buyerId, courseId]
  );
  return result.rows.length > 0;
}

/**
 * Idempotency lookup for externally-driven purchases (CreatorFeed's
 * checkout webhook): the provider's `txn_id` is stored verbatim in
 * `payment_gateway_reference` by `markSuccess`, so a redelivered webhook
 * for the same transaction can be detected and ignored instead of
 * crediting the reward tiers twice.
 */
async function findByGatewayReference(client, reference) {
  const result = await client.query(
    `SELECT id, buyer_id, course_id, amount, status, payment_gateway_reference
     FROM purchases WHERE payment_gateway_reference = $1 LIMIT 1`,
    [reference]
  );
  return result.rows[0] || null;
}

module.exports = {
  createPendingPurchase,
  findPendingById,
  findPendingByIdForUpdate,
  markSuccess,
  markFailed,
  hasSuccessfulPurchase,
  findByGatewayReference,
};
