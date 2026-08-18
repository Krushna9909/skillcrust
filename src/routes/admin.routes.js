/**
 * src/routes/admin.routes.js
 *
 * Mounted at /api/v1/admin (see routes/index.js). Entirely separate from
 * user auth per spec1.md's "Admin Auth" section — admins live in their own
 * `admins` table (Checkpoint 1), have their own two-step login + 2FA
 * (Checkpoint 8, src/controllers/adminAuth.controller.js), and every route
 * here except the three auth ones is gated by `requireAdmin`
 * (src/middleware/admin.middleware.js — real as of Checkpoint 8).
 *
 * Checkpoint 8 wired up everything except `GET /admin/fraud-flags`, which
 * checkpoint.md explicitly assigned to Checkpoint 9 (the detection logic
 * that populates `fraud_flags` didn't exist yet in Checkpoint 8) — now
 * real too, backed by src/services/fraudDetection.js.
 *
 * `POST /admin/logout` is a small addition beyond CP0's original stubs —
 * symmetry with the regular user auth flow's logout, trivial and
 * low-risk. Flagged in checkpoint.md.
 */

const express = require('express');

const requireAdmin = require('../middleware/admin.middleware');
const verifyCaptcha = require('../middleware/captcha.middleware');
const { adminLoginLimiter, adminTwoFactorLimiter } = require('../middleware/rateLimiter');
const adminAuthController = require('../controllers/adminAuth.controller');
const adminController = require('../controllers/admin.controller');

const router = express.Router();

function notImplemented(name, checkpoint) {
  return (req, res) => {
    res.status(501).json({
      error: { message: `${name} not implemented yet — see Checkpoint ${checkpoint} in checkpoint.md` },
    });
  };
}

// --- Admin auth (no requireAdmin on these — this IS the login) -------------
router.post('/login', adminLoginLimiter, verifyCaptcha, adminAuthController.login);
router.post('/login/verify-2fa', adminTwoFactorLimiter, adminAuthController.verifyTwoFactor);
router.post('/logout', adminAuthController.logout);

// --- Session check (Checkpoint 12 — the admin frontend's "am I logged in") -
router.get('/me', requireAdmin, adminController.getMe);

// --- User management (Checkpoint 8) -----------------------------------------
router.get('/users', requireAdmin, adminController.getAllUsers);
router.post('/users', requireAdmin, adminController.createUser);
router.patch('/users/:id/deactivate', requireAdmin, adminController.setUserActiveStatus);

// --- Course management (Checkpoint 8) + lecture management (Checkpoint 6) --
router.get('/courses', requireAdmin, adminController.getAllCourses);
router.post('/courses', requireAdmin, adminController.createCourse);
router.patch('/courses/:id', requireAdmin, adminController.updateCourse);
router.post('/courses/:id/lectures', requireAdmin, adminController.createLecture);
router.get('/courses/:id/lectures', requireAdmin, adminController.getLecturesForCourse);
router.patch('/courses/:id/lectures/:lectureId', requireAdmin, adminController.updateLecture);
// Not one of CP0's originally-stubbed routes — added in Checkpoint 6 for
// atomic bulk reordering; see admin.controller.js's reorderLectures for why.
router.put('/courses/:id/lectures/reorder', requireAdmin, adminController.reorderLectures);

// --- Visibility endpoints (Checkpoint 8, except fraud-flags: Checkpoint 9) -
router.get('/kyc-submissions', requireAdmin, adminController.getKycSubmissions);
router.get('/withdrawals', requireAdmin, adminController.getAllWithdrawals);
router.get('/referral-trees', requireAdmin, adminController.getReferralTree);
router.get('/fraud-flags', requireAdmin, adminController.getFraudFlags);
router.get('/liability-summary', requireAdmin, adminController.getLiabilitySummary);

module.exports = router;
