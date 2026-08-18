/**
 * migrations/1700000005000_create-reward-transactions-table.js
 *
 * The audit trail behind `users.wallet_balance`. Every wallet credit —
 * direct bonus, indirect bonus, or the company's own cut — gets one row
 * here, written inside the SAME DB transaction as the `users.wallet_balance`
 * UPDATE that applies it (Checkpoint 3's job). This table is what makes
 * "why does this wallet have this balance" answerable, and is also the
 * natural source for dashboard revenue figures (today/7d/30d/all-time) and
 * the leaderboard (Checkpoint 7) — both are just filtered/grouped sums over
 * this table.
 *
 * `reward_type` covers all three legs of a single purchase's payout per
 * spec1.md: the buyer's direct referrer, that referrer's own referrer
 * (indirect), and the company's cut — which per spec1.md's "Company" column
 * also needs *somewhere* to land. DECISION: the company's cut is credited
 * to the COMPANY system account's own wallet_balance, recorded here with
 * reward_type = 'company', rather than a separate un-owned ledger — this
 * reuses the exact same crediting mechanism as direct/indirect bonuses
 * (COMPANY is a `users` row like any other, just flagged
 * `is_system_account`), so Checkpoint 3 doesn't need a third code path.
 * Flag in checkpoint.md if you'd rather the company cut go somewhere
 * outside the wallet system entirely (e.g. a separate `company_ledger`
 * table with no possibility of "withdrawal") — as built, nothing currently
 * stops COMPANY's wallet from going through the same withdrawal flow as
 * everyone else's, which may or may not be desired.
 */

exports.up = (pgm) => {
  pgm.createTable('reward_transactions', {
    id: 'id',

    purchase_id: {
      type: 'integer',
      notNull: true,
      references: '"purchases"',
      onDelete: 'RESTRICT',
    },
    recipient_id: {
      type: 'integer',
      notNull: true,
      references: '"users"',
      onDelete: 'RESTRICT',
    },

    reward_type: { type: 'varchar(10)', notNull: true },
    amount: { type: 'numeric(10,2)', notNull: true },

    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('reward_transactions', 'reward_transactions_type_check', {
    check: `"reward_type" IN ('direct', 'indirect', 'company')`,
  });
  pgm.addConstraint('reward_transactions', 'reward_transactions_amount_positive', {
    check: '"amount" >= 0',
  });

  pgm.createIndex('reward_transactions', 'recipient_id');
  pgm.createIndex('reward_transactions', 'purchase_id');
  // Revenue-by-time-window queries (dashboard, leaderboard) filter on this.
  pgm.createIndex('reward_transactions', 'created_at');
};

exports.down = (pgm) => {
  pgm.dropTable('reward_transactions');
};
