/**
 * src/models/fraudFlag.model.js
 *
 * Raw-SQL query functions for the `fraud_flags` table (see Checkpoint 1's
 * migration for the schema — append-only, visibility-only per spec1.md,
 * no auto-block, no dismiss workflow). Transaction-agnostic like every
 * other model file. `src/services/fraudDetection.js` owns the actual
 * threshold/window/dedup DECISIONS; this file just runs the queries it's
 * told to.
 */

/**
 * Signups from `ip` within the last `windowHours`, oldest-signup-first —
 * used by fraudDetection.js to both COUNT (is this over the threshold?)
 * and, if a flag gets created, to populate `user_ids`.
 */
async function findRecentUserIdsBySignupIp(client, ip, windowHours) {
  const result = await client.query(
    `SELECT id FROM users
     WHERE signup_ip = $1 AND created_at >= now() - make_interval(hours => $2)
     ORDER BY id`,
    [ip, windowHours]
  );
  return result.rows.map((row) => row.id);
}

/**
 * Dedup check — has this exact IP already been flagged (for this flag
 * type) within `windowHours`? Prevents a burst of signups from the same
 * IP from creating a near-duplicate flag on every single one.
 */
async function findRecentFlagForIp(client, ip, flagType, windowHours) {
  const result = await client.query(
    `SELECT id FROM fraud_flags
     WHERE ip_address = $1 AND flag_type = $2
       AND created_at >= now() - make_interval(hours => $3)`,
    [ip, flagType, windowHours]
  );
  return result.rows[0] || null;
}

async function createFlag(client, { flagType, ipAddress, userIds, details }) {
  const result = await client.query(
    `INSERT INTO fraud_flags (flag_type, ip_address, user_ids, details)
     VALUES ($1, $2, $3, $4)
     RETURNING id, flag_type, ip_address, user_ids, details, created_at`,
    [flagType, ipAddress, userIds, details ? JSON.stringify(details) : null]
  );
  return result.rows[0];
}

/**
 * Checkpoint 8/9: admin visibility (spec1.md: "Visibility into: ...
 * fraud-flag alerts"). Every flag, newest first, with each implicated
 * user's id/name/refer-code resolved inline (via `user_ids`'s array
 * membership) so the admin doesn't need a second round trip per flag to
 * see who's involved.
 */
async function findAllForAdmin(client) {
  const result = await client.query(
    `SELECT
       f.id, f.flag_type, f.ip_address, f.user_ids, f.details, f.created_at,
       COALESCE(
         json_agg(
           json_build_object('id', u.id, 'fullName', u.full_name, 'referCode', u.refer_code)
           ORDER BY u.id
         ) FILTER (WHERE u.id IS NOT NULL),
         '[]'
       ) AS users
     FROM fraud_flags f
     LEFT JOIN users u ON u.id = ANY(f.user_ids)
     GROUP BY f.id
     ORDER BY f.created_at DESC`
  );
  return result.rows;
}

module.exports = {
  findRecentUserIdsBySignupIp,
  findRecentFlagForIp,
  createFlag,
  findAllForAdmin,
};
