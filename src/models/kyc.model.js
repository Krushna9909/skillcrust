/**
 * src/models/kyc.model.js
 *
 * Raw-SQL query functions for `kyc_type_a` and `kyc_type_b` (see
 * Checkpoint 1's migrations for the schema + design decisions — notably:
 * one row per user per type, upsert-on-resubmit via `ON CONFLICT (user_id)
 * DO UPDATE`, auto-approved so `status` is always `'approved'` today).
 *
 * The `*_encrypted` columns are opaque strings to this file — encryption/
 * decryption happens in the controller via src/utils/encryption.js, never
 * here, so this file can't accidentally decrypt something into a log
 * statement. Every SELECT below returns the encrypted columns as-is.
 */

async function upsertTypeA(client, data) {
  const result = await client.query(
    `INSERT INTO kyc_type_a
       (user_id, account_holder_name, ifsc_code, bank_name,
        account_number_encrypted, aadhaar_number_encrypted, pan_number_encrypted)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       account_holder_name = EXCLUDED.account_holder_name,
       ifsc_code = EXCLUDED.ifsc_code,
       bank_name = EXCLUDED.bank_name,
       account_number_encrypted = EXCLUDED.account_number_encrypted,
       aadhaar_number_encrypted = EXCLUDED.aadhaar_number_encrypted,
       pan_number_encrypted = EXCLUDED.pan_number_encrypted,
       updated_at = now()
     RETURNING id, user_id, status, submitted_at, updated_at`,
    [
      data.userId,
      data.accountHolderName,
      data.ifscCode,
      data.bankName,
      data.accountNumberEncrypted,
      data.aadhaarNumberEncrypted,
      data.panNumberEncrypted,
    ]
  );
  return result.rows[0];
}

async function findTypeAByUserId(client, userId) {
  const result = await client.query(
    `SELECT id, user_id, account_holder_name, ifsc_code, bank_name,
            account_number_encrypted, aadhaar_number_encrypted, pan_number_encrypted,
            status, submitted_at, updated_at
     FROM kyc_type_a WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function upsertTypeB(client, { userId, upiId }) {
  const result = await client.query(
    `INSERT INTO kyc_type_b (user_id, upi_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET
       upi_id = EXCLUDED.upi_id,
       updated_at = now()
     RETURNING id, user_id, status, submitted_at, updated_at`,
    [userId, upiId]
  );
  return result.rows[0];
}

async function findTypeBByUserId(client, userId) {
  const result = await client.query(
    `SELECT id, user_id, upi_id, status, submitted_at, updated_at
     FROM kyc_type_b WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Existence checks for Checkpoint 5's stated dependency ("withdrawal
 * endpoint, gated on the relevant KYC type being complete"). Boolean
 * "does a row exist" rather than checking `status === 'approved'`
 * explicitly — every row IS auto-approved today (no other status is ever
 * set), but existence is the more honest thing to check: it's really
 * asking "has this user submitted this KYC type," which is what gates
 * the withdrawal method per spec1.md. Only the query primitive is added
 * here — Checkpoint 5 owns the actual gating logic in its withdrawal
 * endpoint, not this file.
 */
async function hasTypeA(client, userId) {
  const result = await client.query('SELECT 1 FROM kyc_type_a WHERE user_id = $1', [userId]);
  return result.rows.length > 0;
}

async function hasTypeB(client, userId) {
  const result = await client.query('SELECT 1 FROM kyc_type_b WHERE user_id = $1', [userId]);
  return result.rows.length > 0;
}

/**
 * Checkpoint 8: admin KYC visibility. spec1.md's masking rule is
 * explicitly scoped — "masked in the UI everywhere EXCEPT entry and
 * ADMIN VIEW" — so this is the ONE other place (besides the user's own
 * submission moment) that's allowed to see full, unmasked values. This
 * function returns the *_encrypted columns as-is (still opaque to this
 * file, per its own header) — admin.controller.js is responsible for
 * decrypting them via src/utils/encryption.js before sending the
 * response, exactly like kyc.controller.js does for a user's own
 * submission. Joined with basic user identity (name, email, refer code)
 * so the admin can tell whose submission they're looking at.
 */
async function findAllTypeASubmissionsForAdmin(client) {
  const result = await client.query(
    `SELECT
       k.id, k.user_id, u.full_name AS user_full_name, u.email AS user_email, u.refer_code AS user_refer_code,
       k.account_holder_name, k.ifsc_code, k.bank_name,
       k.account_number_encrypted, k.aadhaar_number_encrypted, k.pan_number_encrypted,
       k.status, k.submitted_at, k.updated_at
     FROM kyc_type_a k
     JOIN users u ON u.id = k.user_id
     ORDER BY k.submitted_at DESC`
  );
  return result.rows;
}

async function findAllTypeBSubmissionsForAdmin(client) {
  const result = await client.query(
    `SELECT
       k.id, k.user_id, u.full_name AS user_full_name, u.email AS user_email, u.refer_code AS user_refer_code,
       k.upi_id, k.status, k.submitted_at, k.updated_at
     FROM kyc_type_b k
     JOIN users u ON u.id = k.user_id
     ORDER BY k.submitted_at DESC`
  );
  return result.rows;
}

module.exports = {
  upsertTypeA,
  findTypeAByUserId,
  upsertTypeB,
  findTypeBByUserId,
  hasTypeA,
  hasTypeB,
  findAllTypeASubmissionsForAdmin,
  findAllTypeBSubmissionsForAdmin,
};
