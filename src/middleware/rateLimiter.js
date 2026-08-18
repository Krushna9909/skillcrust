/**
 * src/middleware/rateLimiter.js
 *
 * Per-IP rate limiting for auth endpoints, using `express-rate-limit`
 * (already a Checkpoint 0 dependency). Limits below are reasonable
 * starting points, not numbers from spec1.md (it only says "rate limiting
 * on signup and login endpoints," no specific thresholds) — flag if you'd
 * like them tuned.
 *
 * `signupLimiter` / `loginLimiter` are the two spec1.md explicitly calls
 * for. `forgotPasswordLimiter` is an addition beyond the literal spec
 * text — email-bombing via a forgot-password form is a common abuse
 * vector, and it's the same one-line pattern, so it seemed worth including
 * rather than leaving that endpoint the only unlimited one in this file.
 * Flag if you'd rather keep this checkpoint strictly to what spec1.md
 * named.
 *
 * Standard `express-rate-limit` in-memory store — fine for a single VPS
 * process (per README's Hostinger VPS target); would need a shared store
 * (e.g. Redis) if this ever runs as multiple processes/instances.
 */

const rateLimit = require('express-rate-limit');

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many signup attempts from this IP. Please try again later.' } },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many login attempts from this IP. Please try again later.' } },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many password reset requests from this IP. Please try again later.' } },
});

// Checkpoint 8: admin login is a higher-value target than a regular
// user's (view all financial/KYC data), so both steps of the two-stage
// login get their own, stricter limiters rather than reusing
// `loginLimiter` above.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many admin login attempts from this IP. Please try again later.' } },
});

const adminTwoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many 2FA verification attempts from this IP. Please try again later.' } },
});

module.exports = {
  signupLimiter,
  loginLimiter,
  forgotPasswordLimiter,
  adminLoginLimiter,
  adminTwoFactorLimiter,
};
