/**
 * src/middleware/ownership.middleware.js
 *
 * Checkpoint 6's "reusable protected file/route middleware" deliverable.
 * First use case: gating `GET /courses/:id/lectures` on the logged-in
 * user actually owning that course (see src/routes/course.routes.js).
 *
 * Deliberately a FACTORY, not a single course-specific function — takes
 * an async predicate `(req) => boolean` and returns middleware that 403s
 * when it resolves false. This is what makes it genuinely reusable for
 * later checkpoints: KYC docs and profile photos (spec1.md's "protected
 * routes, not public static paths, for anything sensitive") will have a
 * DIFFERENT ownership definition (does this photo/doc belong to
 * `req.user.id`, nothing to do with course purchases), but the exact same
 * shape — `requireOwnership(async (req) => <boolean>)` — covers both
 * without duplicating the 403-and-error-handling boilerplate.
 *
 * Always runs AFTER `requireAuth` in a route chain (needs `req.user` to
 * exist) — this file doesn't check that itself, same convention as every
 * other middleware here assuming the routes wire it in the right order.
 */

const { createHttpError } = require('../utils/httpError');

/**
 * @param {(req: import('express').Request) => Promise<boolean>} checkFn
 * @param {string} [message] - shown on a 403; keep this generic (per
 *   errorHandler.js's logging constraint, and because confirming exactly
 *   *why* access was denied can itself leak information about a resource
 *   the requester doesn't own)
 */
function requireOwnership(checkFn, message = 'You do not have access to this resource.') {
  return async (req, res, next) => {
    try {
      const owns = await checkFn(req);
      if (!owns) {
        return next(createHttpError(403, message));
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requireOwnership };
