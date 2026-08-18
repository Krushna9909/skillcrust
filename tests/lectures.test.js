/**
 * tests/lectures.test.js
 *
 * Checkpoint 6. The admin lecture-management routes are gated behind
 * `requireAdmin`, which stays a Checkpoint 8 stub — genuinely unreachable
 * over HTTP right now (see admin.controller.js's file header), so these
 * tests exercise the underlying model functions directly, plus
 * `admin.controller.js`'s `reorderLectures` handler directly (with a
 * minimal mock `req`/`res`/`next`) since its set-equality validation is
 * real, non-trivial logic worth verifying precisely — the same "verify
 * the logic independent of the route gate" approach used in Checkpoint
 * 5's liability-summary testing.
 *
 * The user-facing side (`GET /courses/:id/lectures`, gated by real
 * `requireAuth` + ownership middleware) IS fully reachable and is
 * exercised via live HTTP separately — see checkpoint.md's Progress Log
 * for that verification, not duplicated here as an automated test to
 * avoid this file also needing to drive a full signup+purchase flow just
 * to get an owned course.
 *
 * *** HOW TO RUN ***
 *   npm run migrate:up && npm run seed && npm test
 *
 * *** CLEANUP ***
 * Every lecture this file creates is deleted in `after()`. Uses course id
 * 1 (SKILLS PRO, always seeded) as a real, stable course to attach test
 * lectures to — cleanup removes exactly the lecture rows this file
 * created (tracked by id), never touches the course itself or any
 * lecture it didn't create.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../src/config/db');
const lectureModel = require('../src/models/lecture.model');
const adminController = require('../src/controllers/admin.controller');

const createdLectureIds = [];
let testCourseId;

function mockReqRes({ params = {}, body = {} } = {}) {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  const req = { params, body };
  return { req, res };
}

async function callController(handler, opts) {
  const { req, res } = mockReqRes(opts);
  let nextError = null;
  await handler(req, res, (err) => {
    nextError = err;
  });
  if (nextError) throw nextError;
  return res;
}

before(async () => {
  const result = await pool.query("SELECT id FROM courses WHERE name = 'SKILLS PRO'");
  if (!result.rows[0]) throw new Error('SKILLS PRO course not found — did you run `npm run seed`?');
  testCourseId = result.rows[0].id;
});

after(async () => {
  try {
    if (createdLectureIds.length > 0) {
      await pool.query('DELETE FROM lectures WHERE id = ANY($1::int[])', [createdLectureIds]);
    }
  } finally {
    await pool.end();
  }
});

test('createLecture auto-appends sequence_order when not specified', async () => {
  const first = await lectureModel.createLecture(pool, {
    courseId: testCourseId,
    title: 'Lecture A',
    videoLink: 'https://youtube.com/watch?v=aaa',
    description: null,
    sequenceOrder: await lectureModel.getNextSequenceOrder(pool, testCourseId),
  });
  createdLectureIds.push(first.id);

  const second = await lectureModel.createLecture(pool, {
    courseId: testCourseId,
    title: 'Lecture B',
    videoLink: 'https://youtube.com/watch?v=bbb',
    description: 'Second lecture',
    sequenceOrder: await lectureModel.getNextSequenceOrder(pool, testCourseId),
  });
  createdLectureIds.push(second.id);

  assert.equal(second.sequence_order, first.sequence_order + 1);
});

test('updateLecture only changes provided fields, and is scoped to the right course', async () => {
  const lecture = await lectureModel.createLecture(pool, {
    courseId: testCourseId,
    title: 'Original Title',
    videoLink: 'https://youtube.com/watch?v=ccc',
    description: 'Original description',
    sequenceOrder: await lectureModel.getNextSequenceOrder(pool, testCourseId),
  });
  createdLectureIds.push(lecture.id);

  const updated = await lectureModel.updateLecture(pool, lecture.id, testCourseId, { title: 'New Title' });
  assert.equal(updated.title, 'New Title');
  assert.equal(updated.video_link, lecture.video_link, 'unspecified fields must be left untouched');
  assert.equal(updated.description, lecture.description);

  // Wrong course id in scope -> not found, even though the lecture id is real.
  const wrongScope = await lectureModel.updateLecture(pool, lecture.id, testCourseId + 999999, { title: 'Should not apply' });
  assert.equal(wrongScope, null);

  const stillOldTitle = (await lectureModel.findLecturesByCourseId(pool, testCourseId))
    .find((row) => row.id === lecture.id);
  assert.equal(stillOldTitle.title, 'New Title', 'the wrong-scope update attempt must not have applied');
});

test('findLecturesByCourseId returns lectures ordered by sequence_order', async () => {
  const lectures = await lectureModel.findLecturesByCourseId(pool, testCourseId);
  for (let i = 1; i < lectures.length; i += 1) {
    assert.ok(
      lectures[i].sequence_order >= lectures[i - 1].sequence_order,
      'lectures must come back in non-decreasing sequence_order'
    );
  }
});

test('admin reorderLectures: valid full reordering is applied atomically', async () => {
  // Clean slate for this specific test: three fresh lectures.
  const l1 = await lectureModel.createLecture(pool, {
    courseId: testCourseId, title: 'Reorder L1', videoLink: 'https://youtube.com/watch?v=r1',
    description: null, sequenceOrder: 101,
  });
  const l2 = await lectureModel.createLecture(pool, {
    courseId: testCourseId, title: 'Reorder L2', videoLink: 'https://youtube.com/watch?v=r2',
    description: null, sequenceOrder: 102,
  });
  const l3 = await lectureModel.createLecture(pool, {
    courseId: testCourseId, title: 'Reorder L3', videoLink: 'https://youtube.com/watch?v=r3',
    description: null, sequenceOrder: 103,
  });
  createdLectureIds.push(l1.id, l2.id, l3.id);

  // These three are NOT the only lectures on the course (other tests added
  // some), so reordering must target exactly this course's FULL current
  // set — fetch it fresh rather than assuming just [l1, l2, l3].
  const fullCurrentIds = await lectureModel.findLectureIdsByCourseId(pool, testCourseId);
  // Put l3 first, l1 last, keep everything else in its existing relative spot.
  const reordered = [l3.id, ...fullCurrentIds.filter((id) => id !== l1.id && id !== l2.id && id !== l3.id), l2.id, l1.id];

  const res = await callController(adminController.reorderLectures, {
    params: { id: String(testCourseId) },
    body: { lectureIds: reordered },
  });

  assert.equal(res.statusCode, 200);
  const byId = Object.fromEntries(res.body.lectures.map((l) => [l.id, l.sequenceOrder]));
  assert.equal(byId[l3.id], 1, 'l3 should now be first');
  assert.equal(byId[l1.id], reordered.length, 'l1 should now be last');
});

test('admin reorderLectures: rejects a set that does not exactly match the course\'s current lectures', async () => {
  const currentIds = await lectureModel.findLectureIdsByCourseId(pool, testCourseId);

  await assert.rejects(
    () => callController(adminController.reorderLectures, {
      params: { id: String(testCourseId) },
      body: { lectureIds: currentIds.slice(0, -1) }, // missing one
    }),
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    }
  );

  await assert.rejects(
    () => callController(adminController.reorderLectures, {
      params: { id: String(testCourseId) },
      body: { lectureIds: [...currentIds, 99999999] }, // extra, nonexistent id
    }),
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    }
  );

  await assert.rejects(
    () => callController(adminController.reorderLectures, {
      params: { id: String(testCourseId) },
      body: { lectureIds: [currentIds[0], currentIds[0], ...currentIds.slice(1)] }, // duplicate
    }),
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});
