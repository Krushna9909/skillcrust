/**
 * src/routes/wallet.routes.js
 *
 * Mounted at /api/v1/wallet (see routes/index.js).
 *
 * PLACEHOLDER — real handlers land in Checkpoint 5 (Wallet & withdrawals).
 * Withdrawal requests must be gated behind the relevant KYC type being
 * complete (Checkpoint 4) — that check belongs inside the real handler,
 * not here.
 *
 * `requireAuth` wired in (Checkpoint 2) — every wallet route needs a
 * logged-in user. Handlers themselves are now real (Checkpoint 5).
 */

const express = require('express');

const requireAuth = require('../middleware/auth.middleware');
const walletController = require('../controllers/wallet.controller');

const router = express.Router();

// GET /api/v1/wallet — balance
router.get('/', requireAuth, walletController.getWalletBalance);

// POST /api/v1/wallet/withdraw — request a withdrawal (UPI or Bank)
router.post('/withdraw', requireAuth, walletController.requestWithdrawal);

// GET /api/v1/wallet/withdrawals — withdrawal history for the logged-in user
router.get('/withdrawals', requireAuth, walletController.getWithdrawalHistory);

module.exports = router;
