/**
 * migrations/1700000006000_create-withdrawals-table.js
 *
 * State machine per spec1.md's Withdrawals section:
 *   pending -> processing (payout call in flight) -> paid | failed
 * On `failed`, the wallet balance must NOT be deducted — Checkpoint 5's
 * job to get that right, this migration just gives it the columns/states.
 * `failure_reason` stays generic/non-sensitive (never a place to log
 * KYC/account details) per the logging constraints in
 * src/middleware/errorHandler.js's file header.
 */

exports.up = (pgm) => {
  pgm.createTable('withdrawals', {
    id: 'id',

    user_id: {
      type: 'integer',
      notNull: true,
      references: '"users"',
      onDelete: 'RESTRICT',
    },

    amount: { type: 'numeric(10,2)', notNull: true },
    method: { type: 'varchar(10)', notNull: true },
    status: { type: 'varchar(12)', notNull: true, default: 'pending' },

    // Opaque reference from the mock (later real) payout gateway.
    payout_gateway_reference: { type: 'varchar(255)', notNull: false },
    failure_reason: { type: 'varchar(255)', notNull: false },

    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('withdrawals', 'withdrawals_method_check', {
    check: `"method" IN ('upi', 'bank')`,
  });
  pgm.addConstraint('withdrawals', 'withdrawals_status_check', {
    check: `"status" IN ('pending', 'processing', 'paid', 'failed')`,
  });
  pgm.addConstraint('withdrawals', 'withdrawals_amount_positive', {
    check: '"amount" > 0',
  });

  pgm.createIndex('withdrawals', 'user_id');
  pgm.createIndex('withdrawals', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('withdrawals');
};
