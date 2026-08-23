/**
 * src/controllers/admin.controller.js
 *
 * Checkpoint 8's admin panel handlers, plus the handlers pre-earmarked
 * for earlier checkpoints (Checkpoint 5's `getLiabilitySummary`,
 * Checkpoint 6's lecture management) that already lived here. Checkpoint
 * 9 adds `getFraudFlags`. Admin AUTH (login/2FA) is a separate file,
 * `adminAuth.controller.js` — this file is the panel/data side only:
 * course management, user management, and KYC/withdrawal/referral-tree/
 * fraud-flag visibility, per spec1.md's Admin Panel section.
 *
 * Every route wired to a handler in this file goes through `requireAdmin`
 * (src/middleware/admin.middleware.js) — real as of this checkpoint, so
 * (unlike Checkpoints 5/6, which built handlers behind a still-inert
 * stub) everything here is now genuinely reachable by an authenticated
 * admin, and genuinely UNREACHABLE by anyone else.
 *
 * *** KYC VISIBILITY — the one place unmasked data is intentional ***
 * `getKycSubmissions` decrypts and returns FULL Aadhaar/PAN/account
 * numbers, not masked. This is not an oversight — spec1.md's masking rule
 * is explicitly scoped: "masked in the UI everywhere EXCEPT entry and
 * ADMIN VIEW." This endpoint IS the admin view. It is, by design, one of
 * the most sensitive endpoints in the whole app, which is exactly why it
 * sits behind full admin auth (password + TOTP) rather than anything
 * lighter.
 */

const { pool } = require('../config/db');
const { createHttpError } = require('../utils/httpError');
const userModel = require('../models/user.model');
const courseModel = require('../models/course.model');
const lectureModel = require('../models/lecture.model');
const kycModel = require('../models/kyc.model');
const withdrawalModel = require('../models/withdrawal.model');
const withdrawalEngine = require('../services/withdrawalEngine');
const fraudFlagModel = require('../models/fraudFlag.model');
const { serializeLecture } = require('./lecture.controller');
const { hashPassword } = require('../utils/password');
const { generateUniqueReferCode } = require('../utils/referCode');
const { decryptField, maskLast4 } = require('../utils/encryption');
const { COMPANY_REFER_CODE } = require('../utils/constants');
const {
  validateEmail,
  validatePhone,
  validateFullName,
  validateState,
  validatePassword,
} = require('../utils/validators');

const TITLE_MAX = 200;
const VIDEO_LINK_MAX = 500;
const DESCRIPTION_MAX = 2000;
// Loose "looks like a URL" check — spec1.md just says "video links (e.g.
// unlisted YouTube/Vimeo embed URLs)," not a specific host allowlist, so
// this deliberately doesn't hard-code youtube.com/vimeo.com and would
// accept any http(s) URL.
const VIDEO_LINK_REGEX = /^https?:\/\/.+/i;

/**
 * spec1.md's "solvency guard": running total of unwithdrawn wallet
 * balance across all users — money the company owes and must keep in
 * reserve, so it isn't spent as free-and-clear revenue.
 */
async function getLiabilitySummary(req, res, next) {
  try {
    const totalUnwithdrawnBalance = await userModel.getTotalWalletLiability(pool);
    return res.status(200).json({ totalUnwithdrawnBalance });
  } catch (err) {
    return next(err);
  }
}

function validateLectureFields(body, { partial }) {
  const errors = [];

  if (!partial || body.title !== undefined) {
    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      errors.push('Lecture title is required.');
    } else if (body.title.trim().length > TITLE_MAX) {
      errors.push('Lecture title is too long.');
    }
  }

  if (!partial || body.videoLink !== undefined) {
    if (!body.videoLink || typeof body.videoLink !== 'string' || !VIDEO_LINK_REGEX.test(body.videoLink.trim())) {
      errors.push('A valid video link (http/https URL) is required.');
    } else if (body.videoLink.trim().length > VIDEO_LINK_MAX) {
      errors.push('Video link is too long.');
    }
  }

  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string' || body.description.length > DESCRIPTION_MAX) {
      errors.push('Description is too long.');
    }
  }

  if (body.sequenceOrder !== undefined && body.sequenceOrder !== null) {
    if (!Number.isInteger(body.sequenceOrder) || body.sequenceOrder < 1) {
      errors.push('sequenceOrder must be a positive integer.');
    }
  }

  return errors;
}

/**
 * GET /admin/courses/:id/lectures — Checkpoint 12b.
 *
 * *** WHY THIS DIDN'T EXIST BEFORE ***
 * `GET /courses/:id/lectures` (course.routes.js, Checkpoint 6) already
 * lists a course's lectures — but it's gated by `requireCourseOwnership`,
 * which checks the CALLER has a successful purchase of that course. An
 * admin never owns courses (there's no purchase behind an admin
 * account), so that route was structurally unusable for admin
 * management — a real gap, only surfaced now that Checkpoint 12b
 * actually needs to render a course's existing lectures before letting
 * an admin edit or reorder them. `createLecture`/`updateLecture`/
 * `reorderLectures` (all pre-existing, Checkpoint 6/8) never needed a
 * matching GET because nothing before 12b needed to DISPLAY the current
 * list first.
 */
async function getLecturesForCourse(req, res, next) {
  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return next(createHttpError(400, 'Invalid course id.'));
  }

  try {
    const course = await courseModel.findCourseById(pool, courseId);
    if (!course) {
      return next(createHttpError(404, 'Course not found.'));
    }
    const lectures = await lectureModel.findLecturesByCourseId(pool, courseId);
    return res.status(200).json({ lectures: lectures.map(serializeLecture) });
  } catch (err) {
    return next(err);
  }
}

/** POST /admin/courses/:id/lectures — Checkpoint 6 */
async function createLecture(req, res, next) {
  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return next(createHttpError(400, 'Invalid course id.'));
  }

  const body = req.body || {};
  const errors = validateLectureFields(body, { partial: false });
  if (errors.length > 0) {
    return next(createHttpError(400, errors.join(' ')));
  }

  try {
    const course = await courseModel.findCourseById(pool, courseId);
    if (!course) {
      return next(createHttpError(404, 'Course not found.'));
    }

    const sequenceOrder = body.sequenceOrder !== undefined && body.sequenceOrder !== null
      ? body.sequenceOrder
      : await lectureModel.getNextSequenceOrder(pool, courseId);

    const lecture = await lectureModel.createLecture(pool, {
      courseId,
      title: body.title.trim(),
      videoLink: body.videoLink.trim(),
      description: body.description !== undefined && body.description !== null ? body.description.trim() : null,
      sequenceOrder,
    });

    return res.status(201).json({ lecture: serializeLecture(lecture) });
  } catch (err) {
    return next(err);
  }
}

/** PATCH /admin/courses/:id/lectures/:lectureId — Checkpoint 6 */
async function updateLecture(req, res, next) {
  const courseId = Number(req.params.id);
  const lectureId = Number(req.params.lectureId);
  if (!Number.isInteger(courseId) || courseId <= 0 || !Number.isInteger(lectureId) || lectureId <= 0) {
    return next(createHttpError(400, 'Invalid course or lecture id.'));
  }

  const body = req.body || {};
  const errors = validateLectureFields(body, { partial: true });
  if (errors.length > 0) {
    return next(createHttpError(400, errors.join(' ')));
  }
  if (
    body.title === undefined && body.videoLink === undefined &&
    body.description === undefined && body.sequenceOrder === undefined
  ) {
    return next(createHttpError(400, 'At least one field (title, videoLink, description, sequenceOrder) is required.'));
  }

  try {
    const lecture = await lectureModel.updateLecture(pool, lectureId, courseId, {
      title: body.title !== undefined ? body.title.trim() : undefined,
      videoLink: body.videoLink !== undefined ? body.videoLink.trim() : undefined,
      description: body.description !== undefined
        ? (body.description === null ? null : body.description.trim())
        : undefined,
      sequenceOrder: body.sequenceOrder !== undefined ? body.sequenceOrder : undefined,
    });

    if (!lecture) {
      return next(createHttpError(404, 'Lecture not found for this course.'));
    }

    return res.status(200).json({ lecture: serializeLecture(lecture) });
  } catch (err) {
    return next(err);
  }
}

/**
 * PUT /admin/courses/:id/lectures/reorder — Checkpoint 6
 *
 * *** NOT one of CP0's originally-stubbed routes — a deliberate addition
 * *** flagged here and in checkpoint.md. checkpoint.md's own CP6 goal text
 * lists "add/edit/REORDER lectures" as a required capability, and spec1.md
 * separately calls out "reorder lecture video links" under the Admin
 * Panel's course management. Doing this via repeated single-lecture PATCH
 * calls (one per lecture, to nudge each one's `sequenceOrder`) would be
 * non-atomic — a failure partway through a drag-and-drop reorder could
 * leave the course's lecture order inconsistent, silently. This endpoint
 * takes the FULL new order in one request and applies it atomically.
 *
 * Body: `{ lectureIds: [3, 1, 2] }` — the course's lecture ids in their
 * new display order. Rejected (400) unless this set is EXACTLY the set of
 * lecture ids that currently belong to the course — no missing, no extra,
 * no duplicates — so a partial or stale client-side list can't silently
 * corrupt the ordering of lectures it didn't know about.
 */
async function reorderLectures(req, res, next) {
  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return next(createHttpError(400, 'Invalid course id.'));
  }

  const lectureIds = (req.body || {}).lectureIds;
  if (!Array.isArray(lectureIds) || lectureIds.length === 0 || !lectureIds.every(Number.isInteger)) {
    return next(createHttpError(400, 'lectureIds must be a non-empty array of lecture ids.'));
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const course = await courseModel.findCourseById(client, courseId);
    if (!course) {
      throw createHttpError(404, 'Course not found.');
    }

    const currentIds = await lectureModel.findLectureIdsByCourseId(client, courseId);
    const currentSet = new Set(currentIds);
    const submittedSet = new Set(lectureIds);

    const sameSize = currentSet.size === submittedSet.size;
    const sameMembers = sameSize && currentIds.every((id) => submittedSet.has(id));
    if (!sameSize || !sameMembers || submittedSet.size !== lectureIds.length) {
      throw createHttpError(
        400,
        'lectureIds must contain exactly the lectures currently belonging to this course, no more, no fewer, no duplicates.'
      );
    }

    for (let position = 0; position < lectureIds.length; position += 1) {
      // eslint-disable-next-line no-await-in-loop
      await lectureModel.setSequenceOrder(client, lectureIds[position], courseId, position + 1);
    }

    const lectures = await lectureModel.findLecturesByCourseId(client, courseId);
    await client.query('COMMIT');

    return res.status(200).json({ lectures: lectures.map(serializeLecture) });
  } catch (err) {
    await client.query('ROLLBACK');
    return next(err);
  } finally {
    client.release();
  }
}

// --- Course management (spec1.md: "create/edit courses") -------------------

function validateCourseFields(body, { partial }) {
  const errors = [];

  if (!partial || body.name !== undefined) {
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 2) {
      errors.push('Course name is required.');
    } else if (body.name.trim().length > 100) {
      errors.push('Course name is too long.');
    }
  }
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string' || body.description.length > 2000) {
      errors.push('Description is too long.');
    }
  }
  for (const field of ['price', 'directBonus', 'indirectBonus', 'companyCut']) {
    if (!partial || body[field] !== undefined) {
      if (typeof body[field] !== 'number' || !Number.isFinite(body[field]) || body[field] < 0) {
        errors.push(`${field} must be a non-negative number.`);
      }
    }
  }
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    errors.push('isActive must be a boolean.');
  }

  return errors;
}

function serializeCourseForAdmin(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    directBonus: row.direct_bonus,
    indirectBonus: row.indirect_bonus,
    companyCut: row.company_cut,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** GET /admin/courses */
async function getAllCourses(req, res, next) {
  try {
    const courses = await courseModel.findAllCoursesForAdmin(pool);
    return res.status(200).json({ courses: courses.map(serializeCourseForAdmin) });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /admin/courses — spec1.md explicitly allows creating new courses,
 * even though today there's a fixed set of 6 (see this checkpoint's
 * comments in course.model.js's `createCourse`). `isActive` defaults to
 * true if omitted — a newly-created course should be purchasable unless
 * the admin says otherwise.
 */
async function createCourse(req, res, next) {
  const body = req.body || {};
  const errors = validateCourseFields(body, { partial: false });
  if (errors.length > 0) {
    return next(createHttpError(400, errors.join(' ')));
  }

  try {
    const course = await courseModel.createCourse(pool, {
      name: body.name.trim(),
      description: body.description !== undefined && body.description !== null ? body.description.trim() : null,
      price: body.price,
      directBonus: body.directBonus,
      indirectBonus: body.indirectBonus,
      companyCut: body.companyCut,
      isActive: body.isActive !== undefined ? body.isActive : true,
    });
    return res.status(201).json({ course: serializeCourseForAdmin(course) });
  } catch (err) {
    if (err.code === '23505') {
      return next(createHttpError(409, 'A course with this name already exists.'));
    }
    return next(err);
  }
}

/** PATCH /admin/courses/:id */
async function updateCourse(req, res, next) {
  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return next(createHttpError(400, 'Invalid course id.'));
  }

  const body = req.body || {};
  const errors = validateCourseFields(body, { partial: true });
  if (errors.length > 0) {
    return next(createHttpError(400, errors.join(' ')));
  }
  const fields = {
    name: body.name !== undefined ? body.name.trim() : undefined,
    description: body.description !== undefined ? (body.description === null ? null : body.description.trim()) : undefined,
    price: body.price,
    directBonus: body.directBonus,
    indirectBonus: body.indirectBonus,
    companyCut: body.companyCut,
    isActive: body.isActive,
  };
  if (Object.values(fields).every((v) => v === undefined)) {
    return next(createHttpError(400, 'At least one field is required.'));
  }

  try {
    const course = await courseModel.updateCourse(pool, courseId, fields);
    if (!course) {
      return next(createHttpError(404, 'Course not found.'));
    }
    return res.status(200).json({ course: serializeCourseForAdmin(course) });
  } catch (err) {
    if (err.code === '23505') {
      return next(createHttpError(409, 'A course with this name already exists.'));
    }
    return next(err);
  }
}

// --- User management (spec1.md: "view all users, add users manually, ------
// remove/deactivate users") -------------------------------------------------

/** GET /admin/users?page=1&pageSize=50 */
async function getAllUsers(req, res, next) {
  const page = Number(req.query.page) || 1;
  const pageSize = Math.min(Number(req.query.pageSize) || 50, 200);

  try {
    const { rows, total } = await userModel.findAllUsersForAdmin(pool, { page, pageSize });
    return res.status(200).json({
      users: rows,
      pagination: { page, pageSize, total },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /admin/users — spec1.md: "add users manually." Deliberately does
 * NOT go through the signup/purchase flow (Checkpoint 2/3) — an
 * admin-added account isn't modeling a real course purchase, so there's
 * no course selection and no `purchases` row created. The admin supplies
 * an initial password directly (same strength rule as normal signup) —
 * a judgment call in the absence of spec detail on this specific flow;
 * flagged in checkpoint.md. `referCode` (optional) lets the admin choose
 * who this account is credited as referred-by; defaults to COMPANY,
 * matching signup's own fallback philosophy.
 */
async function createUser(req, res, next) {
  const body = req.body || {};
  const errors = [];

  const nameErr = validateFullName(body.fullName);
  if (nameErr) errors.push(nameErr);
  const emailErr = validateEmail(body.email);
  if (emailErr) errors.push(emailErr);
  const phoneResult = validatePhone(body.phone);
  if (phoneResult.error) errors.push(phoneResult.error);
  const stateErr = validateState(body.state);
  if (stateErr) errors.push(stateErr);
  const passwordErr = validatePassword(body.password);
  if (passwordErr) errors.push(passwordErr);

  if (errors.length > 0) {
    return next(createHttpError(400, errors.join(' ')));
  }

  const email = body.email.trim().toLowerCase();
  const phone = phoneResult.normalized;
  const fullName = body.fullName.trim();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let referrer;
    if (body.referCode) {
      referrer = await userModel.findByReferCode(client, body.referCode.trim().toUpperCase());
      if (!referrer) {
        throw createHttpError(400, 'referCode does not match any existing user.');
      }
    } else {
      referrer = await userModel.findByReferCode(client, COMPANY_REFER_CODE);
    }

    if (await userModel.findByEmail(client, email)) {
      throw createHttpError(409, 'An account with this email already exists.');
    }
    if (await userModel.findByPhone(client, phone)) {
      throw createHttpError(409, 'An account with this phone number already exists.');
    }

    const referCode = await generateUniqueReferCode(client);
    const passwordHash = await hashPassword(body.password);

    const user = await userModel.createUserByAdmin(client, {
      referCode,
      referrerId: referrer.id,
      fullName,
      email,
      phone,
      passwordHash,
      state: body.state,
    });

    await client.query('COMMIT');
    return res.status(201).json({ user });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      const field = err.constraint === 'users_email_key' ? 'email'
        : err.constraint === 'users_phone_key' ? 'phone number' : 'field';
      return next(createHttpError(409, `An account with this ${field} already exists.`));
    }
    return next(err);
  } finally {
    client.release();
  }
}

/**
 * PATCH /admin/users/:id/deactivate — spec1.md: "remove/deactivate
 * users." Body `{ isActive: false }` (or an empty body, defaulting to
 * `false`, matching the route's own name) deactivates; `{ isActive: true
 * }` reactivates through this SAME route rather than a second endpoint —
 * see user.model.js's `setUserActiveStatus` comment for the reasoning
 * (hard-delete isn't realistically supported by this schema's `ON DELETE
 * RESTRICT` foreign keys, so "remove" and "deactivate" are treated as the
 * same action).
 */
async function setUserActiveStatus(req, res, next) {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return next(createHttpError(400, 'Invalid user id.'));
  }

  const body = req.body || {};
  const isActive = body.isActive !== undefined ? body.isActive : false;
  if (typeof isActive !== 'boolean') {
    return next(createHttpError(400, 'isActive must be a boolean.'));
  }

  try {
    const user = await userModel.setUserActiveStatus(pool, userId, isActive);
    if (!user) {
      return next(createHttpError(404, 'User not found.'));
    }
    return res.status(200).json({ user });
  } catch (err) {
    return next(err);
  }
}

// --- Visibility endpoints ----------------------------------------------

/**
 * GET /admin/kyc-submissions — see this file's header for why FULL,
 * unmasked values are returned here (spec1.md's explicit admin-view
 * carve-out). `*MaskedPreview` fields are also included alongside the
 * full values, purely as a convenience for an admin UI that might want
 * to show masked-by-default with a "reveal" toggle — the full value is
 * always present in the response either way, this isn't a security
 * boundary, just a UI nicety.
 */
async function getKycSubmissions(req, res, next) {
  try {
    const [typeARows, typeBRows] = await Promise.all([
      kycModel.findAllTypeASubmissionsForAdmin(pool),
      kycModel.findAllTypeBSubmissionsForAdmin(pool),
    ]);

    const typeA = typeARows.map((row) => {
      const accountNumber = decryptField(row.account_number_encrypted);
      const aadhaarNumber = decryptField(row.aadhaar_number_encrypted);
      const panNumber = decryptField(row.pan_number_encrypted);
      return {
        id: row.id,
        userId: row.user_id,
        userFullName: row.user_full_name,
        userEmail: row.user_email,
        userReferCode: row.user_refer_code,
        accountHolderName: row.account_holder_name,
        ifscCode: row.ifsc_code,
        bankName: row.bank_name,
        accountNumber,
        accountNumberMaskedPreview: maskLast4(accountNumber),
        aadhaarNumber,
        aadhaarNumberMaskedPreview: maskLast4(aadhaarNumber),
        panNumber,
        panNumberMaskedPreview: maskLast4(panNumber),
        status: row.status,
        submittedAt: row.submitted_at,
        updatedAt: row.updated_at,
      };
    });

    const typeB = typeBRows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userFullName: row.user_full_name,
      userEmail: row.user_email,
      userReferCode: row.user_refer_code,
      upiId: row.upi_id,
      status: row.status,
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
    }));

    return res.status(200).json({ typeA, typeB });
  } catch (err) {
    return next(err);
  }
}

/** GET /admin/withdrawals — every withdrawal, every user. */
async function getAllWithdrawals(req, res, next) {
  try {
    const rows = await withdrawalModel.findAllForAdmin(pool);
    const withdrawals = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userFullName: row.user_full_name,
      userReferCode: row.user_refer_code,
      amount: row.amount,
      method: row.method,
      status: row.status,
      payoutGatewayReference: row.payout_gateway_reference,
      failureReason: row.failure_reason,
      holderName: row.holder_name,
      holderEmail: row.holder_email,
      accountNumberLast4: row.account_number_last4,
      ifscCode: row.ifsc_code,
      upiId: row.upi_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    return res.status(200).json({ withdrawals });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /admin/withdrawals/:id/approve — releases a pending withdrawal to
 * the payout provider (CreatorFeed when configured). The wallet balance
 * was already reserved when the user submitted the request; the engine
 * refunds it automatically if the payout is declined.
 */
async function approveWithdrawal(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return next(createHttpError(400, 'A valid withdrawal id is required.'));
    }
    const withdrawal = await withdrawalEngine.approveAndPayout(id);
    return res.status(200).json({ withdrawal });
  } catch (err) {
    return next(err);
  }
}

/** POST /admin/withdrawals/:id/reject — refunds the reserved amount. */
async function rejectWithdrawal(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return next(createHttpError(400, 'A valid withdrawal id is required.'));
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const withdrawal = await withdrawalEngine.rejectWithdrawal(id, reason || 'Rejected by admin.');
    return res.status(200).json({ withdrawal });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /admin/referral-trees — see user.model.js's `findReferralTreeForAdmin`
 * for why this is a flat edge list rather than a server-nested tree.
 */
async function getReferralTree(req, res, next) {
  try {
    const rows = await userModel.findReferralTreeForAdmin(pool);
    const nodes = rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      referCode: row.refer_code,
      isSystemAccount: row.is_system_account,
      referrerId: row.referrer_id,
      referrerFullName: row.referrer_full_name,
      referrerReferCode: row.referrer_refer_code,
    }));
    return res.status(200).json({ nodes });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /admin/fraud-flags — Checkpoint 9. spec1.md: "Visibility into: ...
 * fraud-flag alerts (same-IP signups)." Every flag ever created
 * (src/services/fraudDetection.js), newest first, each with its
 * implicated users' id/name/refer-code already resolved (see
 * fraudFlag.model.js's `findAllForAdmin`) — no dismiss/resolve action
 * exists, per spec1.md's "visibility only" framing (Checkpoint 1's
 * migration deliberately left no `resolved` column for this reason).
 */
async function getFraudFlags(req, res, next) {
  try {
    const rows = await fraudFlagModel.findAllForAdmin(pool);
    const flags = rows.map((row) => ({
      id: row.id,
      flagType: row.flag_type,
      ipAddress: row.ip_address,
      userIds: row.user_ids,
      users: row.users,
      details: row.details,
      createdAt: row.created_at,
    }));
    return res.status(200).json({ flags });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /admin/me — Checkpoint 12. A minimal "who am I / am I still
 * logged in" endpoint, analogous to how `GET /user/profile` doubles as
 * the regular-user app shell's session-check call. Nothing in Checkpoint
 * 8/9 needed this (no frontend existed yet to call it) — added now
 * because the admin frontend needs a cheap, purpose-built probe rather
 * than piggybacking the session check on an unrelated, heavier endpoint
 * like `getLiabilitySummary`.
 */
async function getMe(req, res) {
  return res.status(200).json({ admin: { id: req.admin.id, email: req.admin.email } });
}

module.exports = {
  getMe,
  getLiabilitySummary,
  getLecturesForCourse,
  createLecture,
  updateLecture,
  reorderLectures,
  getAllCourses,
  createCourse,
  updateCourse,
  getAllUsers,
  createUser,
  setUserActiveStatus,
  getKycSubmissions,
  getAllWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  getReferralTree,
  getFraudFlags,
};
