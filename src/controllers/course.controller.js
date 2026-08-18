/**
 * src/controllers/course.controller.js
 *
 * Checkpoint 10: `GET /courses` and `GET /courses/:id` — public, no auth,
 * per spec1.md's "Course listing/detail pages (with pricing and
 * description)." CP0's original stub comment earmarked these for this
 * checkpoint's public frontend. Lecture listing (`GET /courses/:id/
 * lectures`, auth + ownership gated) is Checkpoint 6's
 * `lecture.controller.js`, a separate file — not touched here.
 *
 * `directBonus` is included in both responses on purpose — see
 * course.model.js's comments on `findAllActiveCourses`/
 * `findActiveCourseById` for why that one reward-split column (and only
 * that one) is public-facing marketing copy, not internal data.
 */

const { pool } = require('../config/db');
const { createHttpError } = require('../utils/httpError');
const courseModel = require('../models/course.model');

function serializePublicCourse(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    directBonus: row.direct_bonus,
  };
}

async function listCourses(req, res, next) {
  try {
    const courses = await courseModel.findAllActiveCourses(pool);
    return res.status(200).json({ courses: courses.map(serializePublicCourse) });
  } catch (err) {
    return next(err);
  }
}

async function getCourseDetail(req, res, next) {
  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return next(createHttpError(400, 'Invalid course id.'));
  }

  try {
    const course = await courseModel.findActiveCourseById(pool, courseId);
    if (!course) {
      // Covers both "no such course" and "exists but deactivated" —
      // deliberately the same 404 either way. An inactive course isn't
      // currently purchasable, so treating it as fully invisible to a
      // direct link (not just absent from the listing) keeps the public
      // site's behavior consistent, rather than showing an "unavailable"
      // detail page for something nobody could actually sign up for.
      return next(createHttpError(404, 'Course not found.'));
    }
    return res.status(200).json({ course: serializePublicCourse(course) });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listCourses, getCourseDetail };
