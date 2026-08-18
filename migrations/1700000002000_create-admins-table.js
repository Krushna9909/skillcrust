/**
 * migrations/1700000002000_create-admins-table.js
 *
 * Completely separate from `users` per spec1.md's "Admin Auth" section —
 * admins don't have KYC, wallet, referral, or course-ownership fields, and
 * a regular user's JWT must never pass admin gating. Two rows are seeded
 * (Checkpoint 1's seed script) via a one-time script, not a public signup
 * path — there is intentionally no "role" column shared with `users`.
 *
 * `totp_secret` / `totp_enabled` exist now (table shape is a Checkpoint 1
 * job) but stay unused until Checkpoint 8 wires up the TOTP setup screen +
 * login flow (spec1.md requires 2FA on every admin login). `totp_secret`
 * is nullable because an admin has none until they complete first-time
 * setup.
 */

exports.up = (pgm) => {
  pgm.createTable('admins', {
    id: 'id',

    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },

    totp_secret: { type: 'varchar(255)', notNull: false },
    totp_enabled: { type: 'boolean', notNull: true, default: false },

    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('admins');
};
