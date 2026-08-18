/**
 * migrations/1700000010000_create-password-reset-tokens-table.js
 *
 * Backs the "forgot password" flow (spec1.md's Auth section, built in
 * Checkpoint 2). Only the token's HASH is stored (`token_hash`), never the
 * raw token — standard practice so a DB read alone can't be used to reset
 * someone's password; Checkpoint 2 emails the raw token in the reset link
 * and hashes whatever comes back on the reset-password submission to
 * compare. `used_at` (rather than a boolean) doubles as an audit trail of
 * when a token was consumed, not just whether it was.
 */

exports.up = (pgm) => {
  pgm.createTable('password_reset_tokens', {
    id: 'id',

    user_id: {
      type: 'integer',
      notNull: true,
      references: '"users"',
      onDelete: 'RESTRICT',
    },

    token_hash: { type: 'varchar(255)', notNull: true, unique: true },
    expires_at: { type: 'timestamptz', notNull: true },
    used_at: { type: 'timestamptz', notNull: false },

    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('password_reset_tokens', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('password_reset_tokens');
};
