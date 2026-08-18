/**
 * src/utils/httpError.js
 *
 * `errorHandler.js` (Checkpoint 0) already reads `err.statusCode` /
 * `err.message` generically — this is just a one-line convenience so
 * controllers don't repeat `const err = new Error(...); err.statusCode = ...;`
 * everywhere.
 */

function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = { createHttpError };
