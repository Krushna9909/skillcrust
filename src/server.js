/**
 * src/server.js
 *
 * Entry point. Confirms the database is reachable before accepting
 * traffic, then starts listening. Run via `npm run dev` (nodemon) or
 * `npm start`.
 */

const config = require('./config/env');
const app = require('./app');
const { testConnection, pool } = require('./config/db');

async function start() {
  try {
    await testConnection();
    // eslint-disable-next-line no-console
    console.log('[server] Database connection OK');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[server] Could not connect to the database. Check DATABASE_URL in .env.');
    // eslint-disable-next-line no-console
    console.error(err.message);
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] Listening on port ${config.port} (${config.nodeEnv})`);
  });

  // Graceful shutdown — close the HTTP server and the DB pool cleanly on
  // SIGTERM/SIGINT (e.g. when the VPS process manager restarts the app),
  // rather than dropping connections mid-request.
  const shutdown = async (signal) => {
    // eslint-disable-next-line no-console
    console.log(`[server] Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
