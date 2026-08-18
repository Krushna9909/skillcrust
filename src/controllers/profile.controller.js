/**
 * src/controllers/profile.controller.js
 *
 * Checkpoint 7's Profile page: `GET /user/profile`, `PATCH /user/profile`
 * (name/email/phone/state), `POST /user/profile/photo` (upload),
 * `GET /user/profile/photo` (serve — protected, never `express.static`),
 * and `POST /user/profile/password`.
 *
 * *** PASSWORD UPDATE — flagged addition ***
 * spec1.md's Profile page explicitly lists "Security: password update,"
 * but checkpoint.md's own Checkpoint 7 bullet list doesn't mention it
 * (only name/email/phone/state/photo). Added anyway since it's clearly
 * part of the Profile page's spec-described scope, cheap to build
 * correctly with utilities that already exist (bcrypt compare/hash,
 * `userModel.updatePasswordHash`), and directly adjacent to everything
 * else in this file — same spirit as Checkpoint 6's reorder-endpoint
 * addition. Flagged in checkpoint.md, not silently added.
 *
 * *** PHOTO — "protected route pattern from Checkpoint 6" ***
 * `getProfilePhoto` always serves the CALLER's OWN photo (`req.user.id`,
 * no `:id` param) — there's no separate "owner" to check against, so
 * Checkpoint 6's `requireOwnership` factory isn't needed here; the route
 * is safe by construction (no id to manipulate). What Checkpoint 6's
 * pattern really carries over is "never `express.static` for anything
 * sensitive — read the file from an authenticated route handler instead"
 * (see app.js's comment), which this does. A parameterized, ownership-
 * gated "view someone else's photo" endpoint would reuse
 * `requireOwnership` properly if a later checkpoint needs one (e.g. an
 * admin viewing any user's photo) — not needed for this checkpoint's
 * scope.
 */

const fs = require('fs');
const path = require('path');

const { pool } = require('../config/db');
const { createHttpError } = require('../utils/httpError');
const userModel = require('../models/user.model');
const { hashPassword, comparePassword } = require('../utils/password');
const { UPLOAD_DIR, ALLOWED_MIME_TYPES } = require('../middleware/photoUpload.middleware');
const {
  validateEmail,
  validatePhone,
  validateFullName,
  validateState,
  validatePassword,
} = require('../utils/validators');

function serializeProfile(row) {
  return {
    id: row.id,
    referCode: row.refer_code,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    state: row.state,
    profilePhotoPath: row.profile_photo_path,
    walletBalance: row.wallet_balance,
    registeredAt: row.created_at,
    updatedAt: row.updated_at,
    sponsor: row.referrer_id === null ? null : {
      fullName: row.sponsor_full_name,
      referCode: row.sponsor_refer_code,
    },
  };
}

async function getProfile(req, res, next) {
  try {
    const profile = await userModel.findProfileById(pool, req.user.id);
    return res.status(200).json({ profile: serializeProfile(profile) });
  } catch (err) {
    return next(err);
  }
}

async function updateProfile(req, res, next) {
  const body = req.body || {};
  const errors = [];
  const fields = {};

  if (body.fullName !== undefined) {
    const err = validateFullName(body.fullName);
    if (err) errors.push(err); else fields.fullName = body.fullName.trim();
  }
  if (body.email !== undefined) {
    const err = validateEmail(body.email);
    if (err) errors.push(err); else fields.email = body.email.trim().toLowerCase();
  }
  if (body.phone !== undefined) {
    const result = validatePhone(body.phone);
    if (result.error) errors.push(result.error); else fields.phone = result.normalized;
  }
  if (body.state !== undefined) {
    const err = validateState(body.state);
    if (err) errors.push(err); else fields.state = body.state;
  }

  if (errors.length > 0) {
    return next(createHttpError(400, errors.join(' ')));
  }
  if (Object.keys(fields).length === 0) {
    return next(createHttpError(400, 'At least one field (fullName, email, phone, state) is required.'));
  }

  try {
    // Pre-check uniqueness for email/phone (excluding self) — friendlier
    // error than relying solely on the DB constraint; same pattern as
    // signup's pre-checks in auth.controller.js.
    if (fields.email !== undefined) {
      const existing = await userModel.findByEmail(pool, fields.email);
      if (existing && existing.id !== req.user.id) {
        return next(createHttpError(409, 'An account with this email already exists.'));
      }
    }
    if (fields.phone !== undefined) {
      const existing = await userModel.findByPhone(pool, fields.phone);
      if (existing && existing.id !== req.user.id) {
        return next(createHttpError(409, 'An account with this phone number already exists.'));
      }
    }

    const updated = await userModel.updateProfile(pool, req.user.id, fields);
    const profile = await userModel.findProfileById(pool, updated.id);
    return res.status(200).json({ profile: serializeProfile(profile) });
  } catch (err) {
    if (err.code === '23505') {
      const field = err.constraint === 'users_email_key' ? 'email'
        : err.constraint === 'users_phone_key' ? 'phone number' : 'field';
      return next(createHttpError(409, `An account with this ${field} already exists.`));
    }
    return next(err);
  }
}

/**
 * POST /user/profile/photo — expects a single multipart field named
 * `photo` (see the route wiring: `photoUpload.single('photo')`).
 */
async function uploadProfilePhoto(req, res, next) {
  if (!req.file) {
    return next(createHttpError(400, 'No photo file was uploaded (expected multipart field "photo").'));
  }

  try {
    const previous = await userModel.findSafeById(pool, req.user.id);
    const relativePath = path.join('profile-photos', req.file.filename);

    const updated = await userModel.updateProfilePhotoPath(pool, req.user.id, relativePath);

    // Best-effort cleanup of the OLD file, after the DB update succeeds —
    // avoids accumulating orphaned files across repeated uploads. Failure
    // to delete the old file is logged but never fails the request; the
    // new photo is already saved and pointed to correctly either way.
    if (previous && previous.profile_photo_path) {
      const oldAbsolutePath = path.join(UPLOAD_DIR, '..', previous.profile_photo_path);
      fs.unlink(oldAbsolutePath, (unlinkErr) => {
        if (unlinkErr && unlinkErr.code !== 'ENOENT') {
          // eslint-disable-next-line no-console
          console.error('[profile] Failed to clean up old profile photo file:', unlinkErr.message);
        }
      });
    }

    return res.status(200).json({ profilePhotoPath: updated.profile_photo_path });
  } catch (err) {
    return next(err);
  }
}

/** GET /user/profile/photo — always the CALLER's own photo, see file header. */
async function getProfilePhoto(req, res, next) {
  try {
    const user = await userModel.findSafeById(pool, req.user.id);
    if (!user || !user.profile_photo_path) {
      return next(createHttpError(404, 'No profile photo has been uploaded.'));
    }

    // Defense-in-depth: `profile_photo_path` is always server-generated
    // (see photoUpload.middleware.js — never derived from client input),
    // but resolve-and-verify anyway so a corrupted/tampered DB value can
    // never be used to read a file outside the uploads directory.
    const uploadsRoot = path.join(UPLOAD_DIR, '..');
    const resolvedPath = path.resolve(uploadsRoot, user.profile_photo_path);
    if (!resolvedPath.startsWith(path.resolve(uploadsRoot) + path.sep)) {
      return next(createHttpError(400, 'Invalid stored photo path.'));
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeType = Object.keys(ALLOWED_MIME_TYPES).find((type) => ALLOWED_MIME_TYPES[type] === ext) || 'application/octet-stream';

    fs.access(resolvedPath, fs.constants.R_OK, (accessErr) => {
      if (accessErr) {
        return next(createHttpError(404, 'Profile photo file was not found on disk.'));
      }
      res.setHeader('Content-Type', mimeType);
      return fs.createReadStream(resolvedPath).pipe(res);
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /user/profile/password — requires the CURRENT password, per
 * standard practice for changing a password while already logged in
 * (protects against a briefly-hijacked/left-open session being used to
 * lock the real owner out). Does not force re-login or invalidate the
 * current session's JWT — same as Checkpoint 2's reset-password flow,
 * which also doesn't auto-log-in or revoke other sessions.
 */
async function updatePassword(req, res, next) {
  const body = req.body || {};

  if (!body.currentPassword || typeof body.currentPassword !== 'string') {
    return next(createHttpError(400, 'Current password is required.'));
  }
  const passwordErr = validatePassword(body.newPassword);
  if (passwordErr) return next(createHttpError(400, passwordErr));
  if (body.newPassword !== body.confirmNewPassword) {
    return next(createHttpError(400, 'New password and confirm password do not match.'));
  }

  try {
    const row = await userModel.findPasswordHashById(pool, req.user.id);
    const matches = await comparePassword(body.currentPassword, row.password_hash);
    if (!matches) {
      return next(createHttpError(401, 'Current password is incorrect.'));
    }

    const newHash = await hashPassword(body.newPassword);
    await userModel.updatePasswordHash(pool, req.user.id, newHash);

    return res.status(200).json({ message: 'Password updated.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getProfile, updateProfile, uploadProfilePhoto, getProfilePhoto, updatePassword };
