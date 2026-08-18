/**
 * src/middleware/notFound.js
 *
 * Catches any request that didn't match a route. Registered after all
 * routes but BEFORE errorHandler in app.js.
 */

function notFound(req, res, next) {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
}

module.exports = notFound;
