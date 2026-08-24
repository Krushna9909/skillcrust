/**
 * src/routes/auth.routes.js
 *
 * Mounted at /api/v1/auth (see routes/index.js). Real handlers
 * (Checkpoint 2) — route paths/methods are unchanged from Checkpoint 0's
 * stub, per checkpoint.md's "never silently rename a locked route" rule.
 *
 * Each mutating endpoint goes through, in order: rate limiter -> CAPTCHA
 * stub -> controller. See middleware/rateLimiter.js and
 * middleware/captcha.middleware.js for what each actually does right now
 * (CAPTCHA is a stub — no provider chosen yet, flagged in checkpoint.md).
 */

const express = require('express');

const authController = require('../controllers/auth.controller');
const verifyCaptcha = require('../middleware/captcha.middleware');
const { signupLimiter, loginLimiter, forgotPasswordLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// POST /api/v1/auth/signup
router.post('/signup', signupLimiter, verifyCaptcha, authController.signup);

// POST /api/v1/auth/login
router.post('/login', loginLimiter, verifyCaptcha, authController.login);

// POST /api/v1/auth/logout
router.post('/logout', authController.logout);

// POST /api/v1/auth/forgot-password
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);

// POST /api/v1/auth/reset-password
router.post('/reset-password', forgotPasswordLimiter, authController.resetPassword);

// POST /api/v1/auth/reset-password-direct  (self-service reset from /forgot-password.html)
router.post('/reset-password-direct', forgotPasswordLimiter, authController.resetPasswordDirect);

module.exports = router;
