/**
 * src/models/lecture.model.js
 *
 * Raw-SQL query functions for the `lectures` table (schema + design
 * decisions were Checkpoint 1's — see that migration: video LINKS only,
 * per spec1.md, not file uploads; `sequence_order` deliberately not
 * unique-constrained per course, specifically so reordering doesn't fight
 * a uniqueness constraint mid-transaction). Transaction-agnostic, same
 * convention as every other model file — callers (admin.controller.js)
 * own transaction boundaries where one is needed (reordering).
 */

async function createLecture(client, { courseId, title, videoLink, description, sequenceOrder }) {
  const result = await client.query(
    `INSERT INTO lectures (course_id, title, video_link, description, sequence_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, course_id, title, video_link, description, sequence_order, created_at, updated_at`,
    [courseId, title, videoLink, description === undefined ? null : description, sequenceOrder]
  );
  return result.rows[0];
}

/**
 * Auto-append position for a new lecture when the admin doesn't specify
 * one explicitly — puts it after every existing lecture in the course.
 */
async function getNextSequenceOrder(client, courseId) {
  const result = await client.query(
    'SELECT COALESCE(MAX(sequence_order), 0) + 1 AS next FROM lectures WHERE course_id = $1',
    [courseId]
  );
  return result.rows[0].next;
}

/**
 * Partial update — only the fields present in `fields` are changed.
 * Scoped by BOTH `lectureId` AND `courseId` in the WHERE clause (not just
 * lectureId) so `PATCH /admin/courses/1/lectures/:lectureId` can never
 * accidentally edit a lecture that actually belongs to a different
 * course, even if the URL's course id and the lecture's real course_id
 * don't match — returns null (not found) in that case rather than
 * silently succeeding on the wrong scope.
 */
async function updateLecture(client, lectureId, courseId, fields) {
  const setClauses = [];
  const values = [];
  let i = 1;

  if (fields.title !== undefined) {
    setClauses.push(`title = $${i}`);
    values.push(fields.title);
    i += 1;
  }
  if (fields.videoLink !== undefined) {
    setClauses.push(`video_link = $${i}`);
    values.push(fields.videoLink);
    i += 1;
  }
  if (fields.description !== undefined) {
    setClauses.push(`description = $${i}`);
    values.push(fields.description);
    i += 1;
  }
  if (fields.sequenceOrder !== undefined) {
    setClauses.push(`sequence_order = $${i}`);
    values.push(fields.sequenceOrder);
    i += 1;
  }
  setClauses.push('updated_at = now()');

  values.push(lectureId, courseId);
  const result = await client.query(
    `UPDATE lectures SET ${setClauses.join(', ')}
     WHERE id = $${i} AND course_id = $${i + 1}
     RETURNING id, course_id, title, video_link, description, sequence_order, created_at, updated_at`,
    values
  );
  return result.rows[0] || null;
}

/** Used by `reorderLectures`'s validation — see admin.controller.js. */
async function findLectureIdsByCourseId(client, courseId) {
  const result = await client.query('SELECT id FROM lectures WHERE course_id = $1', [courseId]);
  return result.rows.map((row) => row.id);
}

async function setSequenceOrder(client, lectureId, courseId, sequenceOrder) {
  await client.query(
    'UPDATE lectures SET sequence_order = $1, updated_at = now() WHERE id = $2 AND course_id = $3',
    [sequenceOrder, lectureId, courseId]
  );
}

/**
 * User- and admin-facing list, ordered for display — `sequence_order` is
 * the admin-controlled position; `id` is just a tie-break for lectures
 * that happen to share a position (shouldn't normally occur, but no
 * uniqueness constraint forces it not to — see file header).
 */
async function findLecturesByCourseId(client, courseId) {
  const result = await client.query(
    `SELECT id, course_id, title, video_link, description, sequence_order, created_at, updated_at
     FROM lectures WHERE course_id = $1
     ORDER BY sequence_order ASC, id ASC`,
    [courseId]
  );
  return result.rows;
}

module.exports = {
  createLecture,
  getNextSequenceOrder,
  updateLecture,
  findLectureIdsByCourseId,
  setSequenceOrder,
  findLecturesByCourseId,
};
