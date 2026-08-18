/**
 * src/middleware/photoUpload.middleware.js
 *
 * Checkpoint 7's profile-photo upload, per spec1.md: "File storage: local
 * disk on VPS, organized folders, served via protected routes (not public
 * static paths)." This file handles the WRITE side (accepting the
 * multipart upload); the READ side (serving it back) is
 * `profile.controller.js`'s `getProfilePhoto`, which never uses
 * `express.static` — see app.js's comment on why.
 *
 * `multer@2.x` (not 1.x — 1.x has known CVEs the npm registry itself
 * warns about on install; 2.x is the current maintained major).
 *
 * Filename is server-generated (`<userId>-<timestamp>.<ext>`), NEVER
 * derived from the client-supplied original filename — avoids path
 * traversal or overwrite tricks via a crafted filename, and ties every
 * file to the uploader for traceability. `profile.controller.js`'s
 * `uploadProfilePhoto` deletes the user's previous photo file (if any)
 * after a successful upload, so this directory doesn't accumulate
 * orphaned files across repeated uploads by the same user.
 */

const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'profile-photos');
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// uploads/profile-photos/.gitkeep already ensures this directory exists in
// a fresh checkout, but create it defensively in case it's ever missing
// (e.g. a deploy that only copied tracked files, and .gitkeep wasn't
// preserved by some tooling) — multer needs the directory to already
// exist, it won't create it.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(req, file, cb) {
    const ext = ALLOWED_MIME_TYPES[file.mimetype] || '';
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES[file.mimetype]) {
    cb(new Error('Profile photo must be a JPEG, PNG, or WEBP image.'));
    return;
  }
  cb(null, true);
}

const photoUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
});

module.exports = { photoUpload, UPLOAD_DIR, ALLOWED_MIME_TYPES };
