/**
 * src/models/rewardTransaction.model.js
 *
 * Writes to the `reward_transactions` audit ledger (see Checkpoint 1's
 * migration for the schema + why this table exists alongside the
 * denormalized `users.wallet_balance`). `createRewardTransaction` is only
 * used by src/services/rewardEngine.js, always inside the same DB
 * transaction as the matching `users.wallet_balance` UPDATE.
 *
 * Checkpoint 7 adds the READ side: this ledger is exactly what dashboard
 * revenue figures, the revenue chart, "recent referrals," and the
 * leaderboard are all built from — no separate reporting table needed,
 * per Checkpoint 1's original design intent for this table.
 */

async function createRewardTransaction(client, { purchaseId, recipientId, rewardType, amount }) {
  const result = await client.query(
    `INSERT INTO reward_transactions (purchase_id, recipient_id, reward_type, amount)
     VALUES ($1, $2, $3, $4)
     RETURNING id, purchase_id, recipient_id, reward_type, amount, created_at`,
    [purchaseId, recipientId, rewardType, amount]
  );
  return result.rows[0];
}

/**
 * spec1.md's dashboard: "Revenue: today, last 7 days, last 30 days,
 * all-time." One query, four windows, via `FILTER` — cheaper than four
 * separate round trips. "Today" and "last N days" both use the DB's own
 * `now()` (UTC) as the reference point, not the app server's clock —
 * keeps this correct regardless of what timezone the app process happens
 * to run in.
 */
async function getRevenueSummary(client, userId) {
  const result = await client.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('day', now())), 0) AS today,
       COALESCE(SUM(amount) FILTER (WHERE created_at >= now() - interval '7 days'), 0) AS last_7_days,
       COALESCE(SUM(amount) FILTER (WHERE created_at >= now() - interval '30 days'), 0) AS last_30_days,
       COALESCE(SUM(amount), 0) AS all_time
     FROM reward_transactions
     WHERE recipient_id = $1`,
    [userId]
  );
  return result.rows[0];
}

/**
 * spec1.md: "Revenue chart." No chart granularity/range is specified —
 * daily totals for the last 30 days is a reasonable, common default for
 * this kind of dashboard chart; flag if a different range/granularity is
 * wanted. Days with zero revenue are included (as 0), not skipped, via
 * `generate_series` LEFT JOINed against actual totals — a chart with
 * missing days would be misleading, not just sparse.
 */
async function getRevenueChartData(client, userId, days = 30) {
  const result = await client.query(
    `SELECT d.day::date AS date, COALESCE(SUM(rt.amount), 0) AS amount
     FROM generate_series(
       date_trunc('day', now()) - ($2 - 1) * interval '1 day',
       date_trunc('day', now()),
       interval '1 day'
     ) AS d(day)
     LEFT JOIN reward_transactions rt
       ON rt.recipient_id = $1 AND date_trunc('day', rt.created_at) = d.day
     GROUP BY d.day
     ORDER BY d.day ASC`,
    [userId, days]
  );
  return result.rows;
}

/**
 * spec1.md's dashboard: "Recent referrals list: name, refer ID, package
 * name, amount — with search." Scoped to `reward_type = 'direct'` — that
 * reward type IS, by construction (see rewardEngine.js), always credited
 * to the buyer's DIRECT referrer, so filtering on it already means "people
 * this user personally referred who bought something," without needing a
 * separate join back through `users.referrer_id`. `search` (optional)
 * matches against the buyer's name or refer code, case-insensitive.
 */
async function getRecentReferrals(client, userId, { search, limit = 20 } = {}) {
  const params = [userId];
  let searchClause = '';
  if (search) {
    params.push(`%${search}%`);
    searchClause = `AND (buyer.full_name ILIKE $${params.length} OR buyer.refer_code ILIKE $${params.length})`;
  }
  params.push(limit);

  const result = await client.query(
    `SELECT
       buyer.full_name AS buyer_name,
       buyer.refer_code AS buyer_refer_code,
       c.name AS package_name,
       rt.amount,
       rt.created_at
     FROM reward_transactions rt
     JOIN purchases p ON p.id = rt.purchase_id
     JOIN users buyer ON buyer.id = p.buyer_id
     JOIN courses c ON c.id = p.course_id
     WHERE rt.recipient_id = $1 AND rt.reward_type = 'direct'
     ${searchClause}
     ORDER BY rt.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

/**
 * spec1.md's Leaderboard: "Top earners: today, last 7 days, last 30 days,
 * all-time." `since = null` means all-time (no lower bound). COMPANY is
 * always excluded (`is_system_account = false`) — it's not a participant
 * to rank, per Checkpoint 1/2's reasoning for adding that flag in the
 * first place.
 */
async function getLeaderboard(client, { since, limit = 10 } = {}) {
  const params = [];
  let sinceClause = '';
  if (since) {
    params.push(since);
    sinceClause = `AND rt.created_at >= $${params.length}`;
  }
  params.push(limit);

  const result = await client.query(
    `SELECT u.id, u.full_name, u.refer_code, COALESCE(SUM(rt.amount), 0) AS total_earned
     FROM reward_transactions rt
     JOIN users u ON u.id = rt.recipient_id
     WHERE u.is_system_account = false
     ${sinceClause}
     GROUP BY u.id, u.full_name, u.refer_code
     ORDER BY total_earned DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

module.exports = {
  createRewardTransaction,
  getRevenueSummary,
  getRevenueChartData,
  getRecentReferrals,
  getLeaderboard,
};
