/**
 * migrations/1700000011000_create-lectures-table.js
 *
 * Per spec1.md's "Course Content Delivery" section: admin adds lecture
 * video LINKS (unlisted YouTube/Vimeo embeds etc.), not file uploads — so
 * there's no `uploads/` interaction here, just a URL column. Table shape
 * only; the actual CRUD (admin add/edit/reorder) and the ownership-gated
 * "list lectures for a course I own" endpoint are Checkpoint 6's job.
 *
 * `sequence_order` is a plain integer, not enforced unique per course —
 * reordering (Checkpoint 6) is easier to implement as "bump a bunch of
 * integers" without fighting a uniqueness constraint mid-transaction.
 * Ordering ties just fall back to `id` (insertion order) at query time.
 */

exports.up = (pgm) => {
  pgm.createTable('lectures', {
    id: 'id',

    course_id: {
      type: 'integer',
      notNull: true,
      references: '"courses"',
      onDelete: 'RESTRICT',
    },

    title: { type: 'varchar(200)', notNull: true },
    video_link: { type: 'varchar(500)', notNull: true },
    sequence_order: { type: 'integer', notNull: true, default: 0 },
    description: { type: 'text', notNull: false },

    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('lectures', 'course_id');
};

exports.down = (pgm) => {
  pgm.dropTable('lectures');
};
