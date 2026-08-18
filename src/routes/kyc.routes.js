/**
 * src/routes/kyc.routes.js
 *
 * Mounted at /api/v1/kyc (see routes/index.js).
 *
 * Checkpoint 4: real handlers. Per spec1.md: Aadhaar/PAN/bank account
 * number are AES-256 encrypted at rest (src/utils/encryption.js), masked
 * everywhere in this file's responses (last-4-only — see
 * kyc.controller.js's file header for the exact masking decision), and
 * never written to any log (see errorHandler.js's comment for the
 * logging constraint this file's validators/controller were written to
 * honor — no error message here ever embeds a submitted KYC value).
 *
 * `requireAuth` wired in (Checkpoint 2) — KYC is always tied to a logged-in
 * user.
 */

const express = require('express');

const requireAuth = require('../middleware/auth.middleware');
const kycController = require('../controllers/kyc.controller');

const router = express.Router();

// POST /api/v1/kyc/bank — Type A submission (auto-approved, upsert on resubmit)
router.post('/bank', requireAuth, kycController.submitBankKyc);

// POST /api/v1/kyc/upi — Type B submission (auto-approved, upsert on resubmit)
router.post('/upi', requireAuth, kycController.submitUpiKyc);

// GET /api/v1/kyc — current user's KYC status (masked)
router.get('/', requireAuth, kycController.getKycStatus);

module.exports = router;
