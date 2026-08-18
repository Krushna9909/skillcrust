/**
 * migrations/1700000001000_create-users-table.js
 *
 * The `users` table backs every real (course-buying) account AND the one
 * seeded `COMPANY` system account (see seeds/companyAccount.seed.js).
 *
 * KEY DESIGN DECISIONS (flag in checkpoint.md if you disagree):
 *
 * 1. `referrer_id` is a SELF-REFERENCING foreign key onto this same table.
 *    Postgres allows this inline in a single CREATE TABLE (the table is
 *    resolvable by name once the column list is parsed). Nullable — the
 *    ONLY row where this should ever be NULL is the COMPANY system account
 *    itself (the root of the whole referral tree). Every real user must
 *    have a referrer, defaulting to COMPANY per spec1.md — that default is
 *    an *application-level* rule enforced at signup (Checkpoint 2), not a
 *    DB NOT NULL constraint, so this migration doesn't hard-code it.
 *    `ON DELETE RESTRICT` because the referral chain must stay intact —
 *    a user can be deactivated (`is_active = false`) but never hard-deleted
 *    while anyone still points at them as a referrer.
 *
 * 2. `wallet_balance` is a DENORMALIZED running total, not computed on the
 *    fly from `reward_transactions`. Checkpoint 3's reward engine is
 *    responsible for updating this column and inserting the matching
 *    `reward_transactions` row inside the SAME database transaction, so
 *    they never drift apart. `reward_transactions` (separate migration)
 *    still exists as the full audit trail / source of truth for "how did
 *    this balance get here" — this column is purely a fast-read cache of
 *    its sum. Flagging this as a decision Checkpoint 3 must honor.
 *
 * 3. `is_system_account` distinguishes the seeded COMPANY account from real
 *    users. It exists so later checkpoints (leaderboard, dashboard revenue
 *    lists, login) can cheaply `WHERE NOT is_system_account` instead of
 *    hard-coding "exclude refer_code = 'COMPANY'" in every query.
 *
 * 4. `password_hash` is NOT NULL for every row, including COMPANY — rather
 *    than making it nullable "because system accounts don't log in," the
 *    seed script hashes a long random, never-displayed string for COMPANY.
 *    This avoids a nullable-password edge case leaking into login-query
 *    logic later (spec1.md's own philosophy for the COMPANY row: no null
 *    edge cases in code). COMPANY is still excluded from login by app logic
 *    checking `is_system_account`, not by the column being null.
 *
 * 5. `state` is a plain VARCHAR, validated against the fixed Indian-states
 *    list at the application layer (signup form / Checkpoint 2 validation),
 *    not a DB enum — keeps this migration from needing a rewrite if that
 *    list ever changes.
 *
 * 6. IDs are plain `serial` (int4), not UUIDs — small, fixed-scope app,
 *    sequential IDs are easier to eyeball/debug, consistent with the raw-SQL
 *    approach chosen in Checkpoint 0.
 */

exports.up = (pgm) => {
  pgm.createTable('users', {
    id: 'id',

    refer_code: { type: 'varchar(20)', notNull: true, unique: true },
    referrer_id: {
      type: 'integer',
      notNull: false,
      references: '"users"',
      onDelete: 'RESTRICT',
    },

    full_name: { type: 'varchar(150)', notNull: true },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    phone: { type: 'varchar(20)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    state: { type: 'varchar(50)', notNull: true },

    profile_photo_path: { type: 'varchar(255)', notNull: false },

    wallet_balance: {
      type: 'numeric(10,2)',
      notNull: true,
      default: 0,
    },

    is_system_account: { type: 'boolean', notNull: true, default: false },
    is_active: { type: 'boolean', notNull: true, default: true },

    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // A user can never be their own referrer (also enforced app-side at
  // signup per spec1.md's "self-referral blocked" rule — this is a
  // belt-and-suspenders DB-level guard, not a substitute for that check,
  // since the app-level check needs to run BEFORE insert to give a clean
  // error message).
  pgm.addConstraint('users', 'users_no_self_referral', {
    check: '"referrer_id" IS NULL OR "referrer_id" != "id"',
  });

  // Referral-chain walks (direct/indirect bonus lookups in Checkpoint 3,
  // "recent referrals" list in Checkpoint 7) always filter/join on this.
  pgm.createIndex('users', 'referrer_id');
};

exports.down = (pgm) => {
  pgm.dropTable('users');
};
