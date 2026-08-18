/**
 * seeds/run.js
 *
 * Entry point for `npm run seed`. Runs all seed steps inside a single DB
 * transaction (all-or-nothing — if any step fails, nothing is committed),
 * in dependency order:
 *   1. COMPANY system account (courses/admins don't depend on it, but it's
 *      the conceptual root of everything else, so it goes first)
 *   2. The 6 fixed courses
 *   3. The 2 admin accounts
 *
 * Each step is idempotent (see the individual seed files) — safe to
 * re-run `npm run seed` repeatedly during development without duplicating
 * data or resetting things that have since changed (e.g. an admin's
 * password after they've logged in and changed it).
 *
 * Convention (per this file's original Checkpoint 0 stub comment): each
 * seed step lives in its own `seeds/*.seed.js` file, kept small enough to
 * re-run independently if ever needed directly.
 */

const { pool } = require('../src/config/db');
const { seedCompanyAccount } = require('./companyAccount.seed');
const { seedCourses } = require('./courses.seed');
const { seedAdmins } = require('./admins.seed');

async function run() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await seedCompanyAccount(client);
    await seedCourses(client);
    await seedAdmins(client);

    await client.query('COMMIT');
    // eslint-disable-next-line no-console
    console.log('[seed] Done.');
  } catch (err) {
    await client.query('ROLLBACK');
    // eslint-disable-next-line no-console
    console.error('[seed] Failed, rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
