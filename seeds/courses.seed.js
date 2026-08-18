/**
 * seeds/courses.seed.js
 *
 * Seeds the 6 fixed courses from spec1.md's pricing table, exactly as
 * spec1.md states them.
 *
 * *** DATA NOTE — see migrations/1700000003000_create-courses-table.js ***
 * BUSINESS PRO's direct_bonus + indirect_bonus + company_cut sums to
 * ₹10,000, not its listed ₹9,999 price. Seeded as-is (not "corrected")
 * since silently changing spec numbers is worse than flagging the mismatch
 * — see checkpoint.md's open questions for Checkpoint 1.
 *
 * Idempotent via `ON CONFLICT (name) DO UPDATE` — re-running `npm run seed`
 * (e.g. after tweaking a reward figure during development) updates the
 * existing rows instead of erroring on the unique constraint or creating
 * duplicates.
 */

const COURSES = [
  {
    name: 'SKILLS PRO',
    price: 699,
    direct_bonus: 510,
    indirect_bonus: 40,
    company_cut: 149,
  },
  {
    name: 'EDITING PRO',
    price: 1499,
    direct_bonus: 1150,
    indirect_bonus: 100,
    company_cut: 249,
  },
  {
    name: 'MARKETING PRO',
    price: 2299,
    direct_bonus: 1800,
    indirect_bonus: 150,
    company_cut: 349,
  },
  {
    name: 'CONTENT PRO',
    price: 4150,
    direct_bonus: 3350,
    indirect_bonus: 200,
    company_cut: 600,
  },
  {
    name: 'AI & AUTOMATION PRO',
    price: 6999,
    direct_bonus: 5400,
    indirect_bonus: 300,
    company_cut: 1299,
  },
  {
    name: 'BUSINESS PRO',
    price: 9999,
    direct_bonus: 7550,
    indirect_bonus: 400,
    company_cut: 2050,
  },
];

/**
 * @param {import('pg').PoolClient} client
 */
async function seedCourses(client) {
  for (const course of COURSES) {
    await client.query(
      `INSERT INTO courses (name, price, direct_bonus, indirect_bonus, company_cut, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name) DO UPDATE SET
         price = EXCLUDED.price,
         direct_bonus = EXCLUDED.direct_bonus,
         indirect_bonus = EXCLUDED.indirect_bonus,
         company_cut = EXCLUDED.company_cut,
         updated_at = now()`,
      [
        course.name,
        course.price,
        course.direct_bonus,
        course.indirect_bonus,
        course.company_cut,
        // Descriptions weren't reproduced in spec1.md's table itself
        // ("see original list") — left as a short placeholder per course
        // for the admin to fill in properly via the Checkpoint 8 admin
        // panel once it exists. Flagged so it isn't mistaken for real
        // marketing copy.
        `${course.name} — placeholder description, replace via admin panel (Checkpoint 8).`,
      ]
    );
  }

  // eslint-disable-next-line no-console
  console.log(`[seed] Courses: upserted ${COURSES.length} course(s).`);
}

module.exports = { seedCourses };
