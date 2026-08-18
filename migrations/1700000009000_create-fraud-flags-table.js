/**
 * migrations/1700000009000_create-fraud-flags-table.js
 *
 * Append-only log, per spec1.md's "visibility only — accounts are not
 * auto-blocked" rule. `user_ids` is a native Postgres integer array (the
 * set of accounts implicated in one flag, e.g. every account that signed
 * up from the same IP in the detection window) — kept as a simple array
 * column rather than a join table since this table is read-only for the
 * app (admin dashboard display, Checkpoint 8/9) and never queried by
 * "find all flags for user X" in a way that would need an indexed join;
 * flag this if that assumption turns out wrong.
 *
 * No `resolved`/`dismissed` column — spec1.md only asks for visibility
 * ("shows a flag/alert"), not a dismiss workflow. Easy to add in
 * Checkpoint 9 if the admin UI ends up wanting one.
 */

exports.up = (pgm) => {
  pgm.createTable('fraud_flags', {
    id: 'id',

    // e.g. 'same_ip_signup' — kept as free-text rather than a DB enum so
    // Checkpoint 9 can introduce new flag types without a migration.
    flag_type: { type: 'varchar(50)', notNull: true },

    ip_address: { type: 'varchar(45)', notNull: true }, // varchar(45) fits IPv6
    user_ids: { type: 'integer[]', notNull: true },

    // Free-form extra context (e.g. device fingerprint, signup timestamps
    // involved) — never put KYC/financial values in here, same rule as
    // every other logging surface in this app.
    details: { type: 'jsonb', notNull: false },

    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('fraud_flags', 'ip_address');
  pgm.createIndex('fraud_flags', 'created_at');
};

exports.down = (pgm) => {
  pgm.dropTable('fraud_flags');
};
