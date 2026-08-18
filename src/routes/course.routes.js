/**
 * src/routes/course.routes.js
 *
 * Mounted at /api/v1/courses (see routes/index.js). Public, pre-login
 * course listing/detail endpoints. Lecture *management* (admin add/edit/
 * reorder) lives under admin.routes.js instead, since that's gated by
 * requireAdmin, not public.
 *
 * PLACEHOLDER — real handlers land in:
 *   - listing/detail: Checkpoint 10 (DONE) — public, no auth.
 *   - lecture list for an owned course -> Checkpoint 6 (DONE)
 *
 * `requireAuth` + the ownership-check middleware are wired on the
 * lectures route only (Checkpoint 6) — gated on being logged in AND
 * owning the course. The listing/detail routes stay public,
 * unauthenticated, per spec1.md's public pages section.
 */

const express = require('express');

const { pool } = require('../config/db');
const requireAuth = require('../middleware/auth.middleware');
const { requireOwnership } = require('../middleware/ownership.middleware');
const purchaseModel = require('../models/purchase.model');
const lectureController = require('../controllers/lecture.controller');
const courseController = require('../controllers/course.controller');

const router = express.Router();

// Checkpoint 6's first use of the reusable requireOwnership factory (see
// src/middleware/ownership.middleware.js) — "does the logged-in user own
// this course" is this specific check; a malformed :id resolves to false
// (403), not a DB error, since Number(req.params.id) below would be NaN.
const requireCourseOwnership = requireOwnership(async (req) => {
  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) return false;
  return purchaseModel.hasSuccessfulPurchase(pool, req.user.id, courseId);
});

// GET /api/v1/courses — list all active courses (public)
router.get('/', courseController.listCourses);

// GET /api/v1/courses/:id — course detail (public)
router.get('/:id', courseController.getCourseDetail);

// GET /api/v1/courses/:id/lectures — only for courses the logged-in user owns
router.get('/:id/lectures', requireAuth, requireCourseOwnership, lectureController.listLecturesForCourse);

module.exports = router;
