/**
 * src/models/course.model.js
 *
 * Raw-SQL query functions for the `courses` table. Checkpoint 2 needed
 * just enough to validate a signup's course selection. Checkpoint 3 added
 * `findCourseById` for the reward engine. Checkpoint 7 adds the
 * ownership-aware queries "My Courses"/dashboard and "Upgrade" need.
 * Checkpoint 10 adds the public listing/detail queries. Admin CRUD
 * queries (Checkpoint 8) are further down this same file.
 */

/**
 * Checkpoint 10: public course listing/detail need `description` too
 * (spec1.md: "Course listing/detail pages (with pricing and
 * description)") — extended rather than adding a near-duplicate query.
 * Existing callers (signup, `/user/purchase`) just ignore the extra
 * column; nothing about their behavior changes.
 */
async function findActiveCourseById(client, courseId) {
  const result = await client.query(
    'SELECT id, name, description, price, direct_bonus FROM courses WHERE id = $1 AND is_active = true',
    [courseId]
  );
  return result.rows[0] || null;
}

/**
 * Checkpoint 10: `GET /courses` (public listing). Only active courses —
 * a deactivated course isn't currently purchasable, so it shouldn't be
 * advertised. Includes `direct_bonus` deliberately: "earn ₹X when someone
 * buys through your link" is core marketing copy for this specific
 * platform (the whole point is the referral program), not internal data
 * — but `indirect_bonus`/`company_cut` are NOT included here, since those
 * are internal reward-mechanics detail a public visitor has no reason to
 * see. (Compare `findAllCoursesForAdmin` in this same file, which returns
 * every column for the admin panel.)
 */
async function findAllActiveCourses(client) {
  const result = await client.query(
    `SELECT id, name, description, price, direct_bonus
     FROM courses WHERE is_active = true ORDER BY id`
  );
  return result.rows;
}

/**
 * Fetches a course by id REGARDLESS of `is_active` — used by the reward
 * engine when resolving an already-created pending purchase. A course
 * that's since been deactivated by an admin should still honor its reward
 * split for a purchase that was already in flight; `is_active` only gates
 * whether NEW purchases can be started (`findActiveCourseById`, above),
 * not whether an existing pending one can be completed.
 */
async function findCourseById(client, courseId) {
  const result = await client.query(
    `SELECT id, name, price, direct_bonus, indirect_bonus, company_cut, is_active
     FROM courses WHERE id = $1`,
    [courseId]
  );
  return result.rows[0] || null;
}

/**
 * Checkpoint 7: "My Courses" + dashboard's owned-course list. Deliberately
 * NOT filtered by `is_active` — ownership persists even if an admin later
 * deactivates a course (same reasoning as `findCourseById` above: a
 * course already owned should stay honored). Ownership itself is a
 * successful purchase, per Checkpoint 1's decision.
 */
async function findOwnedCoursesByUserId(client, userId) {
  const result = await client.query(
    `SELECT c.id, c.name, c.description, c.price
     FROM courses c
     JOIN purchases p ON p.course_id = c.id
     WHERE p.buyer_id = $1 AND p.status = 'success'
     ORDER BY c.id`,
    [userId]
  );
  return result.rows;
}

/**
 * Checkpoint 7: "Upgrade" — active courses the user does NOT already own.
 * Unlike `findOwnedCoursesByUserId`, this DOES filter by `is_active`
 * (spec1.md's Upgrade page should only offer currently-purchasable
 * courses, matching signup/`/user/purchase`'s own `findActiveCourseById`
 * gate).
 */
async function findUnownedActiveCoursesForUser(client, userId) {
  const result = await client.query(
    `SELECT c.id, c.name, c.description, c.price, c.direct_bonus, c.indirect_bonus, c.company_cut
     FROM courses c
     WHERE c.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM purchases p
         WHERE p.course_id = c.id AND p.buyer_id = $1 AND p.status = 'success'
       )
     ORDER BY c.id`,
    [userId]
  );
  return result.rows;
}

/**
 * Checkpoint 8: admin course management's list view — every course,
 * every column (including `is_active` and the reward split), regardless
 * of active status. Unlike every other course query in this file, this
 * one is meant to show the admin the FULL picture, not a filtered
 * user-facing subset.
 */
async function findAllCoursesForAdmin(client) {
  const result = await client.query(
    `SELECT id, name, description, price, direct_bonus, indirect_bonus, company_cut, is_active, created_at, updated_at
     FROM courses ORDER BY id`
  );
  return result.rows;
}

/**
 * Checkpoint 8: admin "create course" — spec1.md's Admin Panel section
 * explicitly says "create/edit courses," even though today there's a
 * fixed set of 6. No uniqueness pre-check here — the DB's own
 * `courses_name_key` UNIQUE constraint is the real backstop, surfaced as
 * a friendly 409 by the controller, matching `createPendingPurchase`'s
 * pattern of leaving uniqueness pre-checks to the controller layer.
 */
async function createCourse(client, data) {
  const result = await client.query(
    `INSERT INTO courses (name, description, price, direct_bonus, indirect_bonus, company_cut, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, description, price, direct_bonus, indirect_bonus, company_cut, is_active, created_at, updated_at`,
    [data.name, data.description, data.price, data.directBonus, data.indirectBonus, data.companyCut, data.isActive]
  );
  return result.rows[0];
}

/**
 * Partial update — only fields present in `fields` are changed. Any
 * combination of name/description/price/directBonus/indirectBonus/
 * companyCut/isActive can be updated in one call.
 */
async function updateCourse(client, courseId, fields) {
  const setClauses = [];
  const values = [];
  let i = 1;

  const columnMap = {
    name: 'name',
    description: 'description',
    price: 'price',
    directBonus: 'direct_bonus',
    indirectBonus: 'indirect_bonus',
    companyCut: 'company_cut',
    isActive: 'is_active',
  };

  for (const [key, column] of Object.entries(columnMap)) {
    if (fields[key] !== undefined) {
      setClauses.push(`${column} = $${i}`);
      values.push(fields[key]);
      i += 1;
    }
  }
  setClauses.push('updated_at = now()');

  values.push(courseId);
  const result = await client.query(
    `UPDATE courses SET ${setClauses.join(', ')} WHERE id = $${i}
     RETURNING id, name, description, price, direct_bonus, indirect_bonus, company_cut, is_active, created_at, updated_at`,
    values
  );
  return result.rows[0] || null;
}

module.exports = {
  findActiveCourseById,
  findAllActiveCourses,
  findCourseById,
  findOwnedCoursesByUserId,
  findUnownedActiveCoursesForUser,
  findAllCoursesForAdmin,
  createCourse,
  updateCourse,
};
