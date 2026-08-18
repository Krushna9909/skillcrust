/**
 * src/controllers/purchase.controller.js
 *
 * Checkpoint 3: the "Upgrade" purchase flow — a logged-in user buying an
 * ADDITIONAL course beyond the one selected at signup. The signup-time
 * purchase itself is handled inline in auth.controller.js's signup
 * handler (both call the same src/services/rewardEngine.js under the
 * hood — see that file for the actual charge+credit logic, which is not
 * duplicated here).
 */

const { pool } = require('../config/db');
const { createHttpError } = require('../utils/httpError');
const courseModel = require('../models/course.model');
const purchaseModel = require('../models/purchase.model');
const paymentGateway = require('../services/payment');
const rewardEngine = require('../services/rewardEngine');

async function purchaseCourse(req, res, next) {
  // Defense-in-depth only — COMPANY can never actually reach this handler
  // today, since Checkpoint 2's login explicitly rejects `is_system_account`
  // sign-ins, so `req.user` can never be COMPANY via a real session. Kept
  // as an explicit guard in case that invariant is ever broken elsewhere.
  if (req.user.isSystemAccount) {
    return next(createHttpError(403, 'System accounts cannot purchase courses.'));
  }

  const courseId = Number(req.body && req.body.courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return next(createHttpError(400, 'A valid course selection is required.'));
  }

  try {
    const course = await courseModel.findActiveCourseById(pool, courseId);
    if (!course) {
      return next(createHttpError(400, 'Selected course does not exist or is not currently available.'));
    }

    if (await purchaseModel.hasSuccessfulPurchase(pool, req.user.id, courseId)) {
      return next(createHttpError(409, 'You already own this course.'));
    }

    const pending = await purchaseModel.createPendingPurchase(pool, {
      buyerId: req.user.id,
      courseId: course.id,
      amount: course.price,
    });

    const simulate = paymentGateway.sanitizeSimulateOverride(req.body && req.body.simulate);
    const outcome = await rewardEngine.processPendingPurchase(pending.id, { simulate });

    // 201 for a newly-owned course; 402 Payment Required is the closest
    // standard status for "the charge itself was declined" — the request
    // was well-formed, the course was valid, the account exists, only the
    // payment step failed. The response body always carries the full
    // `status`/`failureReason` either way, so a client shouldn't need to
    // branch on status code alone.
    const statusCode = outcome.status === 'success' ? 201 : 402;
    return res.status(statusCode).json({ purchase: outcome });
  } catch (err) {
    return next(err);
  }
}

module.exports = { purchaseCourse };
