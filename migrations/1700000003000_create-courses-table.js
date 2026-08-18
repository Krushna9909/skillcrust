/**
 * migrations/1700000003000_create-courses-table.js
 *
 * The 6 fixed courses from spec1.md's pricing table. Column names map to
 * the spec's table headers as: price <- "Price", direct_bonus <- "Direct
 * Referral Bonus", indirect_bonus <- "Indirect Referral Bonus",
 * company_cut <- "Company".
 *
 * *** FLAG FOR HUMAN REVIEW *** — spec1.md's pricing table doesn't sum
 * cleanly for course #6 (BUSINESS PRO): direct_bonus (7550) + indirect_bonus
 * (400) + company_cut (2050) = 10000, but price is listed as 9999 (off by
 * ₹1). Every other course's three components sum exactly to its price. This
 * migration does NOT add a CHECK constraint enforcing
 * `price = direct_bonus + indirect_bonus + company_cut` because of this
 * one mismatch — seed data (Checkpoint 1) is entered exactly as spec1.md
 * states it, discrepancy and all. See checkpoint.md Progress Log / open
 * questions for Checkpoint 1 — this needs a decision from the human
 * (fix a figure, or confirm ₹9999 stands with the ₹1 falling to nobody)
 * before Checkpoint 3's reward engine goes live.
 *
 * `is_active` lets the admin panel (Checkpoint 8) hide a course from new
 * purchases without deleting it (deleting would orphan `purchases`/
 * `lectures` rows) — a reasonable, low-risk extension beyond the literal
 * spec text, flagged here in case you'd rather not have it.
 */

exports.up = (pgm) => {
  pgm.createTable('courses', {
    id: 'id',

    name: { type: 'varchar(100)', notNull: true, unique: true },
    description: { type: 'text', notNull: false },

    price: { type: 'numeric(10,2)', notNull: true },
    direct_bonus: { type: 'numeric(10,2)', notNull: true },
    indirect_bonus: { type: 'numeric(10,2)', notNull: true },
    company_cut: { type: 'numeric(10,2)', notNull: true },

    is_active: { type: 'boolean', notNull: true, default: true },

    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('courses', 'courses_amounts_non_negative', {
    check: '"price" > 0 AND "direct_bonus" >= 0 AND "indirect_bonus" >= 0 AND "company_cut" >= 0',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('courses');
};
