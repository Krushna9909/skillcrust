/**
 * src/models/user.model.js
 *
 * Raw-SQL query functions for the `users` table (see Checkpoint 1's
 * migration for the schema + design decisions). Checkpoint 2's auth flow,
 * Checkpoint 3's reward engine (chain-walking + wallet crediting),
 * Checkpoint 5's wallet/withdrawal balance helpers, Checkpoint 7's profile
 * read/update queries, and Checkpoint 8's admin user-management/referral-
 * tree queries all live here — this is the one file for anything touching
 * the `users` table, added to as each checkpoint needs more of it rather
 * than duplicated elsewhere.
 *
 * Every function accepts an explicit `client` (a checked-out `pg`
 * PoolClient) rather than reaching for the shared `pool` itself — signup
 * needs several of these calls inside ONE transaction (see
 * auth.controller.js), and passing the client through makes that
 * explicit and impossible to get wrong by accident. Callers that aren't
 * in a transaction can simply pass `pool` itself, since `pool.query` and
 * `client.query` share the same signature.
 *
 * `SELECT_SAFE_COLUMNS` deliberately excludes `password_hash` — every
 * function here that returns a user row uses it, so it's structurally
 * hard to accidentally leak a hash back to a controller/response.
 */

const SELECT_SAFE_COLUMNS = `
  id, refer_code, referrer_id, full_name, email, phone, state,
  profile_photo_path, wallet_balance, is_system_account, is_active,
  created_at, updated_at
`;

async function findByEmail(client, email) {
  const result = await client.query(
    'SELECT id, password_hash, is_active, is_system_account, refer_code FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

async function findByPhone(client, phone) {
  const result = await client.query('SELECT id FROM users WHERE phone = $1', [phone]);
  return result.rows[0] || null;
}

async function findByReferCode(client, referCode) {
  const result = await client.query(
    'SELECT id, refer_code, is_active FROM users WHERE refer_code = $1',
    [referCode]
  );
  return result.rows[0] || null;
}

async function findSafeById(client, id) {
  const result = await client.query(
    `SELECT ${SELECT_SAFE_COLUMNS} FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Minimal row used by auth.middleware.js on every authenticated request —
 * just enough to confirm the account is still valid, not the full profile.
 */
async function findAuthStatusById(client, id) {
  const result = await client.query(
    'SELECT id, is_active, is_system_account, refer_code FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * @param {import('pg').PoolClient} client
 * @param {object} data
 * @returns {Promise<object>} the safe (no password_hash) user row
 */
/**
 * `signupIp` (Checkpoint 9) is optional — only real self-service signups
 * (auth.controller.js) ever pass one; admin-created accounts
 * (`createUserByAdmin`, below) never capture a request IP at all, since
 * there isn't a real signup request behind them. Deliberately NOT in
 * `SELECT_SAFE_COLUMNS` (same exclusion pattern as `password_hash`) —
 * this is an internal fraud-detection field, not something any API
 * response should echo back.
 */
async function createUser(client, data) {
  const result = await client.query(
    `INSERT INTO users
       (refer_code, referrer_id, full_name, email, phone, password_hash, state, signup_ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${SELECT_SAFE_COLUMNS}`,
    [
      data.referCode,
      data.referrerId,
      data.fullName,
      data.email,
      data.phone,
      data.passwordHash,
      data.state,
      data.signupIp || null,
    ]
  );
  return result.rows[0];
}

async function updatePasswordHash(client, userId, passwordHash) {
  await client.query(
    'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
    [passwordHash, userId]
  );
}

/**
 * Minimal row used by the reward engine (Checkpoint 3) to walk the
 * referral chain one hop at a time — just the id and its own referrer_id,
 * nothing else. Named distinctly from `findByReferCode`/`findSafeById`
 * since this is specifically a chain-walking primitive, called fresh on
 * every purchase per spec1.md ("Referral tiers are calculated relative to
 * each individual purchase... the chain lookup always starts fresh from
 * the buyer").
 */
async function findReferrerChainInfo(client, id) {
  const result = await client.query(
    'SELECT id, referrer_id FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Atomically adds `amount` to a user's wallet balance. Always called
 * inside the same DB transaction as the matching `reward_transactions`
 * INSERT (see src/services/rewardEngine.js) — this function alone is NOT
 * the source of truth for "why" a balance changed, the paired ledger row
 * is.
 */
async function incrementWalletBalance(client, userId, amount) {
  await client.query(
    'UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = now() WHERE id = $2',
    [amount, userId]
  );
}

/**
 * Checkpoint 5: the current balance for the wallet page (`GET /wallet`).
 * Deliberately its own minimal query rather than reusing `findSafeById`'s
 * full profile — same "purpose-specific over general-purpose" pattern as
 * `findAuthStatusById` above.
 */
async function getWalletBalance(client, userId) {
  const result = await client.query('SELECT wallet_balance FROM users WHERE id = $1', [userId]);
  return result.rows[0] ? result.rows[0].wallet_balance : null;
}

/**
 * Checkpoint 5: atomic check-and-deduct in a SINGLE statement — the WHERE
 * clause's `wallet_balance >= $1` makes the balance check and the
 * deduction one atomic operation (Postgres's row-level locking during an
 * UPDATE already serializes concurrent attempts on the same row), rather
 * than a separate SELECT-then-UPDATE that would leave a race window where
 * two concurrent withdrawal requests could each see a sufficient balance
 * and both deduct, overdrawing the wallet. This is the fund "reservation"
 * step for a withdrawal — see src/services/withdrawalEngine.js for how a
 * failed payout gets this refunded via `incrementWalletBalance` above.
 *
 * @returns {Promise<string|null>} the new balance if the deduction
 *   succeeded, or `null` if the balance was insufficient (0 rows
 *   affected) — callers should treat `null` as "insufficient balance,"
 *   not as an error to propagate blindly.
 */
async function deductWalletBalanceIfSufficient(client, userId, amount) {
  const result = await client.query(
    `UPDATE users SET wallet_balance = wallet_balance - $1, updated_at = now()
     WHERE id = $2 AND wallet_balance >= $1
     RETURNING wallet_balance`,
    [amount, userId]
  );
  return result.rows[0] ? result.rows[0].wallet_balance : null;
}

/**
 * Checkpoint 5: solvency guard's underlying total. Wiring it into an
 * actual admin-facing endpoint is gated behind `requireAdmin`, which
 * stays a stub until Checkpoint 8 (see src/routes/admin.routes.js and
 * src/controllers/admin.controller.js).
 */
async function getTotalWalletLiability(client) {
  const result = await client.query('SELECT COALESCE(SUM(wallet_balance), 0) AS total FROM users');
  return result.rows[0].total;
}

/**
 * Checkpoint 7: the Profile page's full view — everything `findSafeById`
 * has, PLUS the sponsor's name + refer code (spec1.md: "sponsor (name +
 * refer code, small font)"). LEFT JOIN, not INNER — every real user has a
 * non-null `referrer_id` so an INNER JOIN would be safe in practice too,
 * but LEFT JOIN costs nothing and doesn't quietly depend on that
 * invariant holding forever.
 */
async function findProfileById(client, userId) {
  const result = await client.query(
    `SELECT
       u.id, u.refer_code, u.referrer_id, u.full_name, u.email, u.phone, u.state,
       u.profile_photo_path, u.wallet_balance, u.is_system_account, u.is_active,
       u.created_at, u.updated_at,
       sponsor.full_name AS sponsor_full_name,
       sponsor.refer_code AS sponsor_refer_code
     FROM users u
     LEFT JOIN users sponsor ON sponsor.id = u.referrer_id
     WHERE u.id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Partial update for the editable Profile fields (spec1.md: "name, email,
 * phone, state") — refer_code/referrer_id/wallet_balance are never
 * touched here, by construction (not accepted as parameters at all).
 */
async function updateProfile(client, userId, fields) {
  const setClauses = [];
  const values = [];
  let i = 1;

  if (fields.fullName !== undefined) {
    setClauses.push(`full_name = $${i}`);
    values.push(fields.fullName);
    i += 1;
  }
  if (fields.email !== undefined) {
    setClauses.push(`email = $${i}`);
    values.push(fields.email);
    i += 1;
  }
  if (fields.phone !== undefined) {
    setClauses.push(`phone = $${i}`);
    values.push(fields.phone);
    i += 1;
  }
  if (fields.state !== undefined) {
    setClauses.push(`state = $${i}`);
    values.push(fields.state);
    i += 1;
  }
  setClauses.push('updated_at = now()');

  values.push(userId);
  const result = await client.query(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${i}
     RETURNING ${SELECT_SAFE_COLUMNS}`,
    values
  );
  return result.rows[0];
}

async function updateProfilePhotoPath(client, userId, profilePhotoPath) {
  const result = await client.query(
    `UPDATE users SET profile_photo_path = $1, updated_at = now()
     WHERE id = $2
     RETURNING ${SELECT_SAFE_COLUMNS}`,
    [profilePhotoPath, userId]
  );
  return result.rows[0];
}

/**
 * Checkpoint 7's password-update flow needs the CURRENT hash to verify
 * against before allowing a change — deliberately its own minimal query
 * (not reusing `findByEmail`, which needs an email, not an id) so a
 * password change never has to look the user up by email first.
 */
async function findPasswordHashById(client, userId) {
  const result = await client.query('SELECT id, password_hash FROM users WHERE id = $1', [userId]);
  return result.rows[0] || null;
}

/**
 * Checkpoint 8: admin "view all users" — includes `is_system_account` so
 * an admin UI can visually flag COMPANY rather than hide it (admin
 * visibility should be complete, per spec1.md's Admin Panel section).
 * Simple offset pagination (`page`/`pageSize`) since a growing user base
 * shouldn't return everything in one unbounded response — spec1.md
 * doesn't specify a page size, 50 is a reasonable default.
 */
async function findAllUsersForAdmin(client, { page = 1, pageSize = 50 } = {}) {
  const offset = (page - 1) * pageSize;
  const result = await client.query(
    `SELECT id, refer_code, referrer_id, full_name, email, phone, state,
            wallet_balance, is_system_account, is_active, created_at, updated_at
     FROM users
     ORDER BY id
     LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );
  const countResult = await client.query('SELECT COUNT(*) AS total FROM users');
  return { rows: result.rows, total: Number(countResult.rows[0].total), page, pageSize };
}

/**
 * Checkpoint 8: admin "add users manually" (spec1.md's Admin Panel
 * section). Unlike normal signup (Checkpoint 2), this does NOT create a
 * `purchases` row — an admin-added account isn't modeling a course
 * purchase, so there's nothing to reserve/charge. `referrerId` defaults
 * to COMPANY if the admin doesn't specify one (resolved by the
 * controller, same fallback philosophy as signup) — this function just
 * takes whatever referrerId it's given, no special-casing.
 */
async function createUserByAdmin(client, data) {
  const result = await client.query(
    `INSERT INTO users
       (refer_code, referrer_id, full_name, email, phone, password_hash, state)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${SELECT_SAFE_COLUMNS}`,
    [
      data.referCode,
      data.referrerId,
      data.fullName,
      data.email,
      data.phone,
      data.passwordHash,
      data.state,
    ]
  );
  return result.rows[0];
}

/**
 * Checkpoint 8: `PATCH /admin/users/:id/deactivate` — spec1.md says
 * "remove/deactivate users." Hard-delete isn't realistically supported by
 * this schema (Checkpoint 1 deliberately chose `ON DELETE RESTRICT` for
 * every FK pointing at `users`, specifically so a user with a referral
 * chain or purchase history can't be deleted out from under it) — this
 * toggles `is_active` instead, treating "remove" and "deactivate" as the
 * same action. Also handles REACTIVATION (`isActive: true`) through this
 * same function/route rather than inventing a second endpoint — see
 * admin.controller.js's `setUserActiveStatus` for how the route accepts
 * either direction.
 */
async function setUserActiveStatus(client, userId, isActive) {
  const result = await client.query(
    `UPDATE users SET is_active = $1, updated_at = now()
     WHERE id = $2
     RETURNING ${SELECT_SAFE_COLUMNS}`,
    [isActive, userId]
  );
  return result.rows[0] || null;
}

/**
 * Checkpoint 8: admin "referral trees" (spec1.md's Admin Panel:
 * "Visibility into: ... referral trees"). Returns a flat EDGE LIST —
 * every user plus their direct referrer's id/name/refer_code — rather
 * than a server-built nested tree structure. This is deliberate: a flat
 * parent-pointer list is trivial for any frontend to reconstruct into a
 * tree (or a filtered subtree rooted at any node) client-side, and it
 * avoids this endpoint needing to guess how deep or how the admin UI
 * actually wants the tree shaped. A recursive CTE could build a proper
 * nested/subtree view later if a specific admin UI need calls for one —
 * not built now since nothing in this checkpoint's scope requires it.
 */
async function findReferralTreeForAdmin(client) {
  const result = await client.query(
    `SELECT
       u.id, u.full_name, u.refer_code, u.is_system_account,
       u.referrer_id,
       referrer.full_name AS referrer_full_name,
       referrer.refer_code AS referrer_refer_code
     FROM users u
     LEFT JOIN users referrer ON referrer.id = u.referrer_id
     ORDER BY u.id`
  );
  return result.rows;
}

module.exports = {
  findByEmail,
  findByPhone,
  findByReferCode,
  findSafeById,
  findAuthStatusById,
  findReferrerChainInfo,
  incrementWalletBalance,
  getWalletBalance,
  deductWalletBalanceIfSufficient,
  getTotalWalletLiability,
  findProfileById,
  updateProfile,
  updateProfilePhotoPath,
  findPasswordHashById,
  findAllUsersForAdmin,
  createUserByAdmin,
  setUserActiveStatus,
  findReferralTreeForAdmin,
  createUser,
  updatePasswordHash,
};
