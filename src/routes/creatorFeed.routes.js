/**
 * src/routes/creatorFeed.routes.js
 *
 * Mounted at /api/v1/creator-feed (see routes/index.js). A NEW, additive
 * resource area — it does not modify or reuse any existing wallet /
 * withdrawal / reward logic.
 *
 * Purpose: act as a server-side proxy in front of the external CreatorFeed
 * API so the bearer token stays on the server (see services/creatorFeed.js).
 *
 * Auth model:
 *   POST /manager        — public (a visitor can request a manager)
 *   GET  /manager/:id    — public read of a manager profile by id
 *   POST /payout         — requires a logged-in user (financial action)
 *   GET  /status         — public, tells the frontend whether the
 *                          integration is configured
 */

const express = require('express');

const config = require('../config/env');
const requireAuth = require('../middleware/auth.middleware');
const { createHttpError } = require('../utils/httpError');
const creatorFeed = require('../services/creatorFeed');
const creatorFeedWebhook = require('../services/creatorFeedWebhook');

const router = express.Router();

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

router.get('/status', (req, res) => {
  res.json({ configured: Boolean(config.creatorFeed.apiToken) });
});

// POST /api/v1/creator-feed/manager — assign a manager
router.post('/manager', async (req, res, next) => {
  try {
    const payload = {
      platform: str(req.body.platform) || 'SkillCrust',
      user_name: str(req.body.user_name),
      user_email: str(req.body.user_email),
      user_phone: str(req.body.user_phone),
    };

    if (!payload.user_name || !payload.user_email || !payload.user_phone) {
      throw createHttpError(400, 'Name, email and phone are all required.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.user_email)) {
      throw createHttpError(400, 'Please enter a valid email address.');
    }
    if (!/^[0-9+\-\s]{8,15}$/.test(payload.user_phone)) {
      throw createHttpError(400, 'Please enter a valid phone number.');
    }

    const data = await creatorFeed.assignManager(payload);
    res.status(201).json({ manager: data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/creator-feed/manager/:managerId
router.get('/manager/:managerId', async (req, res, next) => {
  try {
    const data = await creatorFeed.getManager(req.params.managerId);
    res.json({ manager: data });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/creator-feed/payout — logged-in users only
router.post('/payout', requireAuth, async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    const payload = {
      creator_reference: str(req.body.creator_reference) || String(req.user.id),
      holder_name: str(req.body.holder_name),
      account_number: str(req.body.account_number),
      ifsc_code: str(req.body.ifsc_code).toUpperCase(),
      holder_email: str(req.body.holder_email),
      amount: String(req.body.amount || ''),
    };

    if (!payload.holder_name || !payload.account_number || !payload.ifsc_code || !payload.holder_email) {
      throw createHttpError(400, 'Account holder name, account number, IFSC code and email are required.');
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(payload.ifsc_code)) {
      throw createHttpError(400, 'Please enter a valid IFSC code.');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw createHttpError(400, 'Please enter a valid payout amount.');
    }

    const data = await creatorFeed.submitPayoutRequest(payload);
    res.status(201).json({ payout: data });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/creator-feed/webhook — INBOUND callback from CreatorFeed's
// hosted checkout. Public by necessity (they call it, not a logged-in
// user), so the shared-secret signature IS the auth — see
// services/creatorFeedWebhook.js. `req.body` here is a raw Buffer, not
// parsed JSON: app.js mounts express.raw() for this exact path so the
// HMAC is computed over the untouched bytes.
router.post('/webhook', async (req, res, next) => {
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const result = await creatorFeedWebhook.handleWebhook(raw, req.headers);
    // Always the provider's expected 200 shape once we've accepted it —
    // anything else makes CreatorFeed retry forever.
    res.json({
      status: 'success',
      message: 'Webhook recorded.',
      ...(result.handled ? {} : { note: result.reason }),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
