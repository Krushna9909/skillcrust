/**
 * src/middleware/errorHandler.js
 *
 * Centralized Express error handler. Must be registered LAST, after all
 * routes, via `app.use(errorHandler)`.
 *
 * *** SECURITY / PRIVACY NOTE — binding on every future checkpoint ***
 * Per spec1.md's KYC section: Aadhaar, PAN, bank account number, and other
 * sensitive fields must NEVER be written to logs (request logs, error logs,
 * etc.). This handler logs `err.message` and stack trace only — if a later
 * checkpoint throws an error that embeds sensitive field values into the
 * error message (e.g. `throw new Error('Invalid PAN: ' + panValue)`), THAT
 * is the bug to avoid, not this handler. Keep error messages generic when
 * they touch KYC/financial data (e.g. "Invalid PAN format", not the value).
 */

const config = require('../config/env');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  // eslint-disable-next-line no-console
  console.error(`[error] ${req.method} ${req.originalUrl} ->`, err.message);
  if (!config.isProduction) {
    // eslint-disable-next-line no-console
    console.error(err.stack);
  }

  res.status(statusCode).json({
    error: {
      message: statusCode === 500 && config.isProduction
        ? 'Internal server error'
        : err.message,
      // Stack traces only in non-production responses, to avoid leaking
      // internals to end users once this is deployed on the VPS.
      ...(config.isProduction ? {} : { stack: err.stack }),
    },
  });
}

module.exports = errorHandler;
