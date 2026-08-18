/**
 * src/services/rewardEngine.js
 *
 * Checkpoint 3 — the core money logic of the whole product. Exposes ONE
 * function, `processPendingPurchase`, called from exactly two places:
 *   - auth.controller.js's signup handler (the account-creation purchase)
 *   - purchase.controller.js (buying an additional/"Upgrade" course)
 * Both entry points share this single implementation rather than each
 * rolling their own charge+credit logic — the reward math must behave
 * identically regardless of which flow triggered it.
 *
 * *** TWO-PHASE DESIGN — READ BEFORE MODIFYING ***
 * This function deliberately does NOT wrap the entire operation in one
 * long-lived DB transaction. It runs in two phases:
 *
 *   Phase 1 (no open transaction): read the pending purchase + course,
 *   then call the payment gateway.
 *
 *   Phase 2 (one short transaction): re-fetch the purchase row WITH
 *   `FOR UPDATE` (locking it), then atomically write the final outcome —
 *   either (a) mark it 'success' + insert all reward_transactions rows +
 *   increment every recipient's wallet_balance, or (b) mark it 'failed'.
 *
 * This is intentional, not an oversight: a DB transaction should never be
 * held open across a slow external network call (this mock resolves
 * instantly, but a REAL gateway's HTTP round-trip could take seconds,
 * during which an open transaction would hold row locks and a connection
 * from the pool the whole time). Structuring it this way now means
 * swapping the mock for Razorpay later (spec1.md's explicit requirement)
 * doesn't also require restructuring this function — only
 * src/services/payment/'s implementation changes.
 *
 * The `FOR UPDATE` lock in Phase 2 (see purchase.model.js's
 * `findPendingByIdForUpdate`) exists specifically to prevent double-
 * crediting if this function is ever accidentally invoked twice for the
 * same purchase (e.g. a double-submitted request) — the second caller's
 * lock wait resolves to find the row no longer `pending`, and it throws
 * rather than crediting anything a second time (callers should treat that
 * as "already being handled," not surface it as a generic 500). Given
 * spec1.md's own words — "no refund policy... rewards are final once
 * credited, since there's no reversal mechanism" — accidental double-
 * crediting would be a real, unrecoverable financial bug, not a cosmetic
 * one. This lock is the one piece of defense against that.
 *
 * *** REWARD MATH — see spec1.md's worked example, replicated exactly ***
 * On every purchase, walk up FRESH from the buyer (never cached, never
 * derived from a previous purchase's result):
 *   - direct recipient   = buyer.referrer_id (guaranteed non-null — every
 *     user always has a referrer, defaulting to COMPANY at signup)
 *   - indirect recipient = directRecipient.referrer_id, falling back to
 *     COMPANY if THAT is null (the one legitimate null: COMPANY is its
 *     own root and has no referrer). This is the one edge case spec1.md
 *     calls out by name ("if User1 has no sponsor, the Indirect Referral
 *     Bonus share... goes to COMPANY instead") and the only extra
 *     fallback this code needs — everything else falls out naturally from
 *     `referrer_id` never being null for a real user.
 *   - company recipient  = COMPANY, always, unconditionally (spec1.md's
 *     "Company" column — see Checkpoint 1's migration comment for why
 *     this goes into COMPANY's own wallet rather than a separate ledger;
 *     re-flagged again here since checkpoint.md's Checkpoint 3 goal
 *     explicitly asks this decision be called out at this checkpoint too).
 * All three land as SEPARATE reward_transactions rows even when the same
 * account ends up receiving more than one (COMPANY can legitimately
 * receive direct + indirect + company on a single purchase if the buyer
 * has no real referral chain — see tests/rewardEngine.test.js).
 * Reward amounts come from the course's CURRENT direct_bonus/
 * indirect_bonus/company_cut at processing time (not snapshotted at
 * purchase-creation time, unlike `purchases.amount`) — see
 * course.model.js's `findCourseById` comment for why that tiny gap is
 * accepted rather than engineered around.
 */

const { pool } = require('../config/db');
const paymentGateway = require('./payment');
const purchaseModel = require('../models/purchase.model');
const courseModel = require('../models/course.model');
const userModel = require('../models/user.model');
const rewardTransactionModel = require('../models/rewardTransaction.model');
const { COMPANY_REFER_CODE } = require('../utils/constants');

/**
 * @param {object} params
 * @param {import('pg').PoolClient} params.buyer - row with at least
 *   { id, referrer_id } for the purchase's buyer
 * @param {object} params.course - row with at least
 *   { direct_bonus, indirect_bonus, company_cut }
 * @returns {Promise<Array<{ recipientId: number, rewardType: string, amount: string|number }>>}
 *   the three credits about to be applied, for the caller to write
 */
async function resolveCredits(client, { buyer, course }) {
  const directRecipientId = buyer.referrer_id;
  if (!directRecipientId) {
    // Should be impossible — every real user gets a non-null referrer_id
    // at signup (defaulting to COMPANY), and COMPANY itself never buys
    // anything. Fail loudly rather than silently skip the direct-tier
    // credit if this invariant is ever violated by a future bug.
    throw new Error(
      `rewardEngine: buyer ${buyer.id} has a null referrer_id — this should never happen post-signup.`
    );
  }

  const directReferrer = await userModel.findReferrerChainInfo(client, directRecipientId);
  const company = await userModel.findByReferCode(client, COMPANY_REFER_CODE);
  if (!company) {
    throw new Error('rewardEngine: COMPANY system account is missing — run `npm run seed`.');
  }

  // The one legitimate null: COMPANY's own referrer_id. Falls back to
  // COMPANY itself, per spec1.md's "every reward always resolves to some
  // account" guarantee.
  const indirectRecipientId = directReferrer.referrer_id || company.id;

  return [
    { recipientId: directRecipientId, rewardType: 'direct', amount: course.direct_bonus },
    { recipientId: indirectRecipientId, rewardType: 'indirect', amount: course.indirect_bonus },
    { recipientId: company.id, rewardType: 'company', amount: course.company_cut },
  ];
}

/**
 * Resolves ONE pending purchase: charges it via the payment gateway, then
 * either credits the 2-tier reward + company cut (on success) or marks it
 * failed (on failure). Idempotent against double-invocation for the same
 * purchase id (see file header re: the `FOR UPDATE` lock).
 *
 * @param {number} purchaseId
 * @param {object} [options]
 * @param {'success'|'failure'|undefined} [options.simulate] - dev/test-only
 *   override, already expected to have been sanitized by the caller (see
 *   src/services/payment/mockGateway.js's `sanitizeSimulateOverride`) —
 *   this function passes it straight through to the gateway without
 *   re-checking NODE_ENV itself, so callers MUST sanitize first.
 * @returns {Promise<{
 *   id: number, status: 'success'|'failed', courseId: number,
 *   amount: string, paymentGatewayReference: string|null,
 *   failureReason: string|null,
 *   credits?: Array<{ recipientId: number, rewardType: string, amount: string }>
 * }>}
 */
async function processPendingPurchase(purchaseId, { simulate } = {}) {
  // --- Phase 1: read-only, no transaction held across the gateway call ---
  const purchase = await purchaseModel.findPendingById(pool, purchaseId);
  if (!purchase) {
    throw new Error(
      `rewardEngine.processPendingPurchase: purchase ${purchaseId} is not pending ` +
      '(already resolved, or does not exist).'
    );
  }

  const chargeResult = await paymentGateway.charge({ amount: purchase.amount, simulate });

  // --- Phase 2: short transaction, writes the final outcome atomically ---
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Re-fetch WITH a row lock — guards against a concurrent duplicate
    // call for this same purchase (see file header).
    const lockedPurchase = await purchaseModel.findPendingByIdForUpdate(client, purchaseId);
    if (!lockedPurchase) {
      // Someone else already resolved it between Phase 1 and here.
      // Nothing to do — do NOT credit anything a second time. Throwing
      // here (rather than rolling back inline) lets the single catch
      // block below handle ROLLBACK + release, same as every other error
      // path in this function.
      throw new Error(
        `rewardEngine.processPendingPurchase: purchase ${purchaseId} was resolved ` +
        'concurrently — refusing to process it a second time.'
      );
    }

    if (!chargeResult.success) {
      const failed = await purchaseModel.markFailed(client, purchaseId, chargeResult.failureReason);
      await client.query('COMMIT');
      return {
        id: failed.id,
        status: failed.status,
        courseId: failed.course_id,
        amount: failed.amount,
        paymentGatewayReference: null,
        failureReason: chargeResult.failureReason,
      };
    }

    const buyer = await userModel.findReferrerChainInfo(client, lockedPurchase.buyer_id);
    const course = await courseModel.findCourseById(client, lockedPurchase.course_id);
    const credits = await resolveCredits(client, { buyer, course });

    for (const credit of credits) {
      // eslint-disable-next-line no-await-in-loop
      await rewardTransactionModel.createRewardTransaction(client, {
        purchaseId: lockedPurchase.id,
        recipientId: credit.recipientId,
        rewardType: credit.rewardType,
        amount: credit.amount,
      });
      // eslint-disable-next-line no-await-in-loop
      await userModel.incrementWalletBalance(client, credit.recipientId, credit.amount);
    }

    const succeeded = await purchaseModel.markSuccess(client, purchaseId, chargeResult.transactionId);
    await client.query('COMMIT');

    return {
      id: succeeded.id,
      status: succeeded.status,
      courseId: succeeded.course_id,
      amount: succeeded.amount,
      paymentGatewayReference: succeeded.payment_gateway_reference,
      failureReason: null,
      credits,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { processPendingPurchase };
