/**
 * src/controllers/lecture.controller.js
 *
 * User-facing side of Checkpoint 6: `GET /courses/:id/lectures`. Mounted
 * in course.routes.js, gated by `requireAuth` + the ownership-check
 * middleware (src/middleware/ownership.middleware.js) — by the time this
 * handler runs, both "is logged in" and "owns this course" are already
 * confirmed, so this function is just a plain list query.
 *
 * Admin-side lecture management (create/edit/reorder) lives in
 * admin.controller.js instead, mounted under admin.routes.js — different
 * route file, different auth gate (`requireAdmin`, not `requireAuth`).
 * `serializeLecture` is exported so admin.controller.js's lecture
 * handlers can reuse the exact same response shape rather than
 * duplicating it.
 */

const { pool } = require('../config/db');
const lectureModel = require('../models/lecture.model');

function serializeLecture(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    videoLink: row.video_link,
    description: row.description,
    sequenceOrder: row.sequence_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listLecturesForCourse(req, res, next) {
  const courseId = Number(req.params.id);
  try {
    const lectures = await lectureModel.findLecturesByCourseId(pool, courseId);
    return res.status(200).json({ lectures: lectures.map(serializeLecture) });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listLecturesForCourse, serializeLecture };
