/**
 * src/routes/user.routes.js
 *
 * Mounted at /api/v1/user (see routes/index.js). Covers everything behind
 * the logged-in sidebar EXCEPT wallet/withdrawals and KYC, which get their
 * own route files (wallet.routes.js, kyc.routes.js) since those are their
 * own checkpoints with their own gating logic.
 *
 * Checkpoint 7: dashboard/affiliate-links/upgrade/leaderboard/my-courses
 * (src/controllers/dashboard.controller.js) and profile get/update/photo/
 * password (src/controllers/profile.controller.js) are all real now.
 * `/purchase` was Checkpoint 3. Nothing left unimplemented in this file.
 *
 * `requireAuth` is wired on every route (Checkpoint 2). The two `/profile/
 * photo` routes additionally use `photoUpload.single('photo')`
 * (Checkpoint 7) — multer MUST run after `requireAuth` in the chain,
 * since its filename-generation callback reads `req.user.id`
 * (see photoUpload.middleware.js).
 */

const express = require('express');
const multer = require('multer');

const requireAuth = require('../middleware/auth.middleware');
const { photoUpload } = require('../middleware/photoUpload.middleware');
const { purchaseCourse } = require('../controllers/purchase.controller');
const dashboardController = require('../controllers/dashboard.controller');
const profileController = require('../controllers/profile.controller');

const router = express.Router();

// GET /api/v1/user/dashboard — Checkpoint 7
router.get('/dashboard', requireAuth, dashboardController.getDashboard);

// GET /api/v1/user/affiliate-links — Checkpoint 7
router.get('/affiliate-links', requireAuth, dashboardController.getAffiliateLinks);

// GET /api/v1/user/my-courses — Checkpoint 7 (see dashboard.controller.js's
// file header for why this landed here instead of Checkpoint 6)
router.get('/my-courses', requireAuth, dashboardController.getMyCourses);

// GET /api/v1/user/upgrade — Checkpoint 7 (list of unowned courses)
router.get('/upgrade', requireAuth, dashboardController.getUpgradeOptions);

// POST /api/v1/user/purchase — Checkpoint 3 (buy a course, triggers reward engine)
router.post('/purchase', requireAuth, purchaseCourse);

// GET /api/v1/user/leaderboard — Checkpoint 7
router.get('/leaderboard', requireAuth, dashboardController.getLeaderboard);

// GET /api/v1/user/my-team — Report > My Team (level 1 referrals, ?search)
router.get('/my-team', requireAuth, dashboardController.getMyTeam);

// GET /api/v1/user/wallet-history — Report > Wallet History (commission ledger)
router.get('/wallet-history', requireAuth, dashboardController.getWalletHistory);

// GET /api/v1/user/profile, PATCH /api/v1/user/profile — Checkpoint 7
router.get('/profile', requireAuth, profileController.getProfile);
router.patch('/profile', requireAuth, profileController.updateProfile);

// POST /api/v1/user/profile/photo, GET /api/v1/user/profile/photo — Checkpoint 7
// A small adapter around multer's own errors (wrong file type from
// fileFilter, oversized file) so they come back as a normal 400 through
// the app's usual error-handling path, instead of multer's own default
// (which would otherwise be caught by the generic 500 fallback).
function handlePhotoUpload(req, res, next) {
  photoUpload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError || err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Profile photo must be 5MB or smaller.'
        : err.message || 'Could not process the uploaded file.';
      const httpErr = new Error(message);
      httpErr.statusCode = 400;
      return next(httpErr);
    }
    return next();
  });
}
router.post('/profile/photo', requireAuth, handlePhotoUpload, profileController.uploadProfilePhoto);
router.get('/profile/photo', requireAuth, profileController.getProfilePhoto);

// POST /api/v1/user/profile/password — Checkpoint 7 (see profile.controller.js's
// file header for why this was added beyond checkpoint.md's own CP7 list)
router.post('/profile/password', requireAuth, profileController.updatePassword);

module.exports = router;
