/**
 * src/config/db.js
 *
 * Postgres connection pool, shared across the whole app.
 *
 * DECISION (Checkpoint 0): we use the raw `pg` driver with hand-written SQL
 * (via node-pg-migrate for schema migrations), rather than a full ORM like
 * Prisma/Sequelize/TypeORM. Reasoning, for whoever picks this up later:
 *   - The schema is small and fixed (spec lists ~9-10 tables), so ORM
 *     modeling overhead isn't buying much.
 *   - The reward-engine logic (Checkpoint 3) involves precise multi-row
 *     transactions (wallet credits across up to 3 accounts per purchase) —
 *     raw SQL inside an explicit `pool.query('BEGIN')`/`COMMIT` transaction
 *     is easier to reason about and audit than an ORM's abstraction over
 *     transactions.
 *   - One less dependency / learning curve for whoever maintains this later.
 * If a future checkpoint has strong reason to introduce an ORM, that's a
 * decision to flag explicitly in checkpoint.md's Progress Log, not to do
 * quietly — it would touch every checkpoint that queries the DB.
 *
 * USAGE (from any controller/model file):
 *   const { pool } = require('../config/db');
 *   const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
 */

const { Pool } = require('pg');
const config = require('./env');

const pool = new Pool({
  connectionString: config.db.connectionString,
});

pool.on('error', (err) => {
  // Errors on idle clients in the pool (e.g. connection dropped) — log and
  // let the process crash/restart rather than silently limping on with a
  // broken pool. In production this should be picked up by a process
  // manager (pm2, systemd, etc.) that restarts the app.
  // eslint-disable-next-line no-console
  console.error('[db] Unexpected error on idle Postgres client', err);
  process.exit(1);
});

/**
 * Quick connectivity check used at server startup so we fail fast (and
 * with a clear message) if the DB is unreachable, instead of the first
 * request mysteriously timing out.
 */
async function testConnection() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

module.exports = { pool, testConnection };
