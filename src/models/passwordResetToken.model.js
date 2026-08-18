/**
 * src/models/passwordResetToken.model.js
 *
 * Only the RAW token is ever emailed to the user — the DB only ever sees
 * `tokenHash` (sha256 of the raw token, computed in auth.controller.js).
 * See migrations/1700000010000_create-password-reset-tokens-table.js for
 * why: a DB read alone should never be enough to reset someone's password.
 */

async function createToken(client, { userId, tokenHash, expiresAt }) {
  const result = await client.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userId, tokenHash, expiresAt]
  );
  return result.rows[0];
}

/**
 * Returns the token row only if it's unused and not yet expired —
 * anything else (not found, already used, expired) resolves to null so
 * the controller can give one uniform "invalid or expired" error without
 * distinguishing why, which would otherwise leak information about
 * whether a given token ever existed.
 */
async function findValidByHash(client, tokenHash) {
  const result = await client.query(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

async function markUsed(client, tokenId) {
  await client.query(
    'UPDATE password_reset_tokens SET used_at = now() WHERE id = $1',
    [tokenId]
  );
}

/**
 * Invalidates every other still-usable reset token for this user once one
 * has been successfully redeemed — standard practice so an old, forgotten
 * "forgot password" email can't be used later after the password has
 * already been changed via a newer one.
 */
async function invalidateOtherTokensForUser(client, userId, exceptTokenId) {
  await client.query(
    `UPDATE password_reset_tokens
     SET used_at = now()
     WHERE user_id = $1 AND id != $2 AND used_at IS NULL`,
    [userId, exceptTokenId]
  );
}

module.exports = {
  createToken,
  findValidByHash,
  markUsed,
  invalidateOtherTokensForUser,
};
