/**
 * migrations/1700000004000_create-purchases-table.js
 *
 * One row per purchase ATTEMPT (not just successes) — the mock payment
 * gateway (Checkpoint 3) can simulate failure, and keeping failed attempts
 * on record is useful for the admin panel / debugging, per spec1.md's
 * general "auditable" tone.
 *
 * DECISION: there is deliberately NO separate "course_ownership" table.
 * A user owns a course if-and-only-if there exists a `purchases` row for
 * that (buyer_id, course_id) with status = 'success'. Keeping ownership
 * derived from this single table (instead of also writing a denormalized
 * ownership row) avoids a second place the two could drift out of sync.
 * "My Courses" / "Upgrade" (Checkpoint 6/7) both query this table directly.
 * Flag in checkpoint.md if a later checkpoint finds this join too slow at
 * scale — an index is in place, but a denormalized table could be added
 * later without breaking this migration.
 *
 * `amount` is a snapshot of what was actually charged at purchase time
 * (copied from `courses.price` at the moment of purchase, not looked up
 * live later) — protects historical purchase records if an admin edits a
 * course's price after the fact.
 *
 * The unique partial index prevents a user from "successfully" buying the
 * same course twice (Upgrade should only ever offer unowned courses, but
 * this is the DB-level backstop against a race condition / double-submit).
 */

exports.up = (pgm) => {
  pgm.createTable('purchases', {
    id: 'id',

    buyer_id: {
      type: 'integer',
      notNull: true,
      references: '"users"',
      onDelete: 'RESTRICT',
    },
    course_id: {
      type: 'integer',
      notNull: true,
      references: '"courses"',
      onDelete: 'RESTRICT',
    },

    amount: { type: 'numeric(10,2)', notNull: true },
    status: { type: 'varchar(10)', notNull: true, default: 'pending' },

    // Opaque reference returned by the mock payment gateway (Checkpoint 3).
    // Naming/shape kept generic so a real gateway's transaction ID slots in
    // here later without a schema change.
    payment_gateway_reference: { type: 'varchar(255)', notNull: false },

    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('purchases', 'purchases_status_check', {
    check: `"status" IN ('pending', 'success', 'failed')`,
  });

  pgm.createIndex('purchases', 'buyer_id');
  pgm.createIndex('purchases', 'course_id');
  pgm.createIndex('purchases', 'status');

  // One successful purchase per (buyer, course) — see file header.
  pgm.createIndex('purchases', ['buyer_id', 'course_id'], {
    unique: true,
    where: `"status" = 'success'`,
    name: 'purchases_unique_successful_ownership',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('purchases');
};
