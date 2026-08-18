/**
 * src/models/admin.model.js
 *
 * Raw-SQL query functions for the `admins` table (see Checkpoint 1's
 * migration for the schema — completely separate from `users`, no shared
 * columns, no shared auth mechanism). Transaction-agnostic like every
 * other model file.
 */

async function findByEmail(client, email) {
  const result = await client.query(
    'SELECT id, email, password_hash, totp_secret, totp_enabled FROM admins WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

async function findById(client, id) {
  const result = await client.query(
    'SELECT id, email, totp_secret, totp_enabled, created_at, updated_at FROM admins WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Minimal row for `requireAdmin`'s per-request check — mirrors
 * `user.model.js`'s `findAuthStatusById` in spirit (just enough to
 * confirm the session is still valid), though admins have no
 * `is_active`-style column to check (spec1.md never describes
 * deactivating an admin — there are only ever the 2 seeded accounts).
 */
async function findAuthStatusById(client, id) {
  const result = await client.query('SELECT id, email FROM admins WHERE id = $1', [id]);
  return result.rows[0] || null;
}

/**
 * Stores a freshly-generated TOTP secret WITHOUT marking setup complete
 * — `totp_enabled` only flips to true in `markTotpEnabled` below, once
 * the admin has actually proven they scanned it correctly by submitting
 * a valid code. Called every time a not-yet-enabled admin logs in (see
 * adminAuth.controller.js) — regenerating the secret on each such login
 * attempt rather than reusing a half-finished one, so an old unscanned QR
 * code never lingers as valid indefinitely.
 */
async function setTotpSecret(client, adminId, totpSecret) {
  const result = await client.query(
    `UPDATE admins SET totp_secret = $1, updated_at = now()
     WHERE id = $2
     RETURNING id, email, totp_secret, totp_enabled`,
    [totpSecret, adminId]
  );
  return result.rows[0];
}

async function markTotpEnabled(client, adminId) {
  const result = await client.query(
    `UPDATE admins SET totp_enabled = true, updated_at = now()
     WHERE id = $1
     RETURNING id, email, totp_enabled`,
    [adminId]
  );
  return result.rows[0];
}

module.exports = {
  findByEmail,
  findById,
  findAuthStatusById,
  setTotpSecret,
  markTotpEnabled,
};
