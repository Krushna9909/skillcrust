/**
 * src/routes/meta.routes.js
 *
 * Checkpoint 10: a small, new resource area for static reference data the
 * FRONTEND needs but that doesn't belong under any existing resource
 * (`/auth`, `/user`, `/courses`, etc.). Right now that's exactly one
 * thing: the fixed Indian states list, used by the signup form's state
 * dropdown.
 *
 * `src/utils/indianStates.js`'s own header comment (written back in
 * Checkpoint 2) already said the intent was "the frontend (Checkpoint 10)
 * and this validation both read from one source of truth" — this route
 * is what actually makes that true, rather than hand-copying the list
 * into a frontend JS file where it could silently drift out of sync with
 * the backend's own validation list.
 *
 * Public, no auth — this is static, non-sensitive reference data.
 */

const express = require('express');

const { INDIAN_STATES } = require('../utils/indianStates');

const router = express.Router();

// GET /api/v1/meta/states
router.get('/states', (req, res) => {
  res.status(200).json({ states: INDIAN_STATES });
});

module.exports = router;
