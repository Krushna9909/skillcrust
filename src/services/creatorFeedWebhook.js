/**
 * src/services/creatorFeedWebhook.js
 *
 * Handles CreatorFeed's INBOUND checkout webhook — the counterpart to
 * src/services/creatorFeed.js (which makes OUTBOUND calls to them).
 *
 * CreatorFeed hosts the product/checkout page; when a student pays there,
 * they POST a `transaction_response` payload to our webhook URL. Sample
 * shape (trimmed):
 *
 *   {
 *     "transaction_response": {
 *       "txn_id": "txn-3782...",            // idempotency key
 *       "txn_bank_reference": "3855643853",
 *       "txn_status": "success",            // success | failed | pending
 *       "txn_paid_amount": "599",
 *       "txn_product_id": "400217a3-...",   // maps to our courses.id
 *       "txn_form_data": { "name": ..., "email": ..., "phone": ... }
 *     }
 *   }
 *
 * Our job on `success`: find the buyer, find the course, create the
 * purchase row and run the SAME reward split the normal purchase flow
 * uses (rewardEngine.creditExternalPurchase) — no second charge, since
 * CreatorFeed already collected the money.
 *
 * SECURITY: never trust this payload without verifying the signature
 * (see verifySignature below) — an unsigned endpoint would let anyone
 * mint fake ₹599 purchases and, with them, real referral commissions.
 */

const crypto = require('crypto');

const config = require('../config/env');
const { pool } = require('../config/db');
const { createHttpError } = require('../utils/httpError');
const userModel = require('../models/user.model');
const courseModel = require('../models/course.model');
const purchaseModel = require('../models/purchase.model');
const rewardEngine = require('./rewardEngine');

/**
 * Timing-safe compare that never throws on length mismatch.
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Two modes, because providers differ and CreatorFeed's exact scheme
 * still needs confirming from their team:
 *   - 'hmac'  (default): header carries hex HMAC-SHA256 of the RAW body,
 *              keyed with the shared secret. Accepts an optional
 *              "sha256=" prefix.
 *   - 'token': header carries the shared secret verbatim.
 *
 * @param {Buffer} rawBody - the untouched request body (see app.js: the
 *   webhook path is parsed with express.raw, because re-serializing JSON
 *   would change the bytes and break every HMAC).
 */
function verifySignature(rawBody, headers) {
  const secret = config.creatorFeed.webhookSecret;
  if (!secret) {
    throw createHttpError(
      503,
      'Creator Feed webhook is not configured yet. Add CREATORFEED_WEBHOOK_SECRET to the server environment.'
    );
  }

  const headerName = config.creatorFeed.webhookSignatureHeader.toLowerCase();
  const provided = String(headers[headerName] || '').trim();
  if (!provided) {
    throw createHttpError(401, 'Missing webhook signature.');
  }

  if (config.creatorFeed.webhookSignatureMode === 'token') {
    if (!safeEqual(provided, secret)) throw createHttpError(401, 'Invalid webhook signature.');
    return;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const candidate = provided.replace(/^sha256=/i, '');
  if (!safeEqual(candidate.toLowerCase(), expected)) {
    throw createHttpError(401, 'Invalid webhook signature.');
  }
}

function parseBody(rawBody) {
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    throw createHttpError(400, 'Webhook body is not valid JSON.');
  }
}

/**
 * Resolves the CreatorFeed product UUID to one of our courses. Primary
 * path is the explicit CREATORFEED_PRODUCT_MAP env mapping; the title
 * fallback exists only so a freshly-added product doesn't silently drop
 * a real payment before the map is updated.
 */
async function resolveCourse(txn) {
  const mapped = config.creatorFeed.productMap[txn.txn_product_id];
  if (mapped) {
    const course = await courseModel.findCourseById(pool, Number(mapped));
    if (course) return course;
  }

  const title = String(txn.txn_product_title || '').trim().toLowerCase();
  if (!title) return null;
  const all = await courseModel.findAllActiveCourses(pool);
  return all.find((c) => String(c.name).trim().toLowerCase() === title) || null;
}

/**
 * @returns {Promise<{ handled: boolean, reason?: string, purchaseId?: number }>}
 *   Always resolves for "we understood you but there is nothing to do"
 *   cases (duplicate delivery, non-success status, unknown buyer). Those
 *   must still answer HTTP 200, otherwise CreatorFeed keeps retrying a
 *   delivery that will never succeed. Only genuine server-side faults
 *   throw.
 */
async function handleWebhook(rawBody, headers) {
  verifySignature(rawBody, headers);

  const payload = parseBody(rawBody);
  const txn = payload && payload.transaction_response;
  if (!txn || !txn.txn_id) {
    throw createHttpError(400, 'Missing transaction_response.txn_id.');
  }

  const status = String(txn.txn_status || '').toLowerCase();

  // Idempotency: CreatorFeed retries until it gets a 200, so the same
  // txn_id can arrive several times. `payment_gateway_reference` holds it.
  const existing = await purchaseModel.findByGatewayReference(pool, txn.txn_id);
  if (existing) {
    return { handled: false, reason: 'duplicate', purchaseId: existing.id };
  }

  if (status !== 'success') {
    // Nothing is credited for pending/failed — we simply acknowledge it.
    return { handled: false, reason: `ignored_status:${status || 'unknown'}` };
  }

  const form = txn.txn_form_data || {};
  const email = String(form.email || '').trim().toLowerCase();
  const phone = String(form.phone || '').trim();

  let buyer = email ? await userModel.findByEmail(pool, email) : null;
  if (!buyer && phone) buyer = await userModel.findByPhone(pool, phone);
  if (!buyer) {
    // The payer has no SkillCrust account yet. Acknowledged (so retries
    // stop) but not credited — reconciled manually from the admin panel.
    return { handled: false, reason: 'unknown_buyer' };
  }

  const course = await resolveCourse(txn);
  if (!course) {
    return { handled: false, reason: 'unknown_product' };
  }

  if (await purchaseModel.hasSuccessfulPurchase(pool, buyer.id, course.id)) {
    return { handled: false, reason: 'already_owned' };
  }

  const amount = String(txn.txn_paid_amount || course.price);
  const pending = await purchaseModel.createPendingPurchase(pool, {
    buyerId: buyer.id,
    courseId: course.id,
    amount,
  });

  const outcome = await rewardEngine.creditExternalPurchase(pending.id, txn.txn_id);
  return { handled: true, purchaseId: outcome.id };
}

module.exports = { handleWebhook, verifySignature };
