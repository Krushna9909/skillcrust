/**
 * migrations/1700000008000_create-kyc-type-b-table.js
 *
 * Type B KYC (UPI withdrawal) per spec1.md: just a UPI ID. Not in spec1.md's
 * encrypted-at-rest list (that list is specifically Aadhaar/PAN/bank account
 * number from Type A), so `upi_id` is stored plain — flag in checkpoint.md
 * if you'd like it encrypted too; cheap to add in Checkpoint 4 since it's
 * the same pattern as kyc_type_a's encrypted columns.
 *
 * Same one-row-per-user / auto-approve / upsert-on-resubmit shape as
 * kyc_type_a — see that migration's comments for the reasoning.
 */

exports.up = (pgm) => {
  pgm.createTable('kyc_type_b', {
    id: 'id',

    user_id: {
      type: 'integer',
      notNull: true,
      unique: true,
      references: '"users"',
      onDelete: 'RESTRICT',
    },

    upi_id: { type: 'varchar(100)', notNull: true },

    status: { type: 'varchar(20)', notNull: true, default: 'approved' },

    submitted_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('kyc_type_b');
};
