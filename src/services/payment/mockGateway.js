/**
 * src/services/payment/mockGateway.js
 *
 * The ONLY payment gateway implementation that exists right now. Mirrors
 * what a real gateway module would look like — same `charge()` shape a
 * real Razorpay/Stripe module would need — so swapping later (see
 * index.js) is a matter of writing a new module behind this same
 * interface, not touching any caller.
 *
 * spec1.md: "Mock payment gateway (simulates success/failure, no real
 * gateway integration yet)." Two independent ways this mock produces a
 * failure, both OFF by default so the rest of the app has predictable,
 * always-succeeding charges to build and test against unless a failure is
 * explicitly asked for:
 *
 *   1. `simulate: 'success' | 'failure'` — an explicit per-call override.
 *      Deliberately ignored outside non-production (see
 *      `sanitizeSimulateOverride` below) — real users hitting a real
 *      deployment can never force their own charge to succeed or fail;
 *      this exists purely so tests (tests/rewardEngine.test.js) and manual
 *      QA can deterministically exercise both the success and failure
 *      paths of the reward engine without needing 1-in-N luck.
 *   2. `MOCK_PAYMENT_FAILURE_RATE` (env var, default 0) — a random failure
 *      rate, for anyone who wants the mock to occasionally decline a
 *      charge the way a real gateway sometimes does (card declined,
 *      network blip, etc.) even without an explicit override. Left at 0
 *      by default because unpredictable failures would make every OTHER
 *      checkpoint's manual testing (and this checkpoint's own worked-
 *      example tests) flaky for no benefit.
 *
 * No real money, network call, or external service involved — this
 * resolves synchronously-ish (one microtask tick) and never throws for a
 * "normal" declined charge; a thrown error is reserved for genuinely
 * unexpected input (e.g. a negative amount), which the caller should
 * treat as a bug, not a declined payment.
 */

const crypto = require('crypto');
const config = require('../../config/env');

/**
 * A request body's `simulate` field is a DEV/TEST-ONLY convenience.
 * Ignored entirely in production regardless of what's sent, so it can
 * never be used to force a real deployment's payment outcome. Returns
 * `'success'`, `'failure'`, or `undefined` (no override — normal random/
 * default behavior applies).
 */
function sanitizeSimulateOverride(value) {
  if (config.isProduction) return undefined;
  if (value === 'success' || value === 'failure') return value;
  return undefined;
}

function generateMockTransactionId() {
  return `MOCK-PAY-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

/**
 * @param {object} params
 * @param {number|string} params.amount - charge amount (informational only
 *   for the mock; a real gateway module would actually need this)
 * @param {'success'|'failure'|undefined} [params.simulate] - already-
 *   sanitized override (callers should pass through
 *   `sanitizeSimulateOverride`'s result, not a raw request body value)
 * @returns {Promise<{ success: boolean, transactionId: string|null, failureReason: string|null }>}
 */
async function charge({ amount, simulate } = {}) {
  if (!(Number(amount) > 0)) {
    throw new Error(`mockGateway.charge: invalid amount "${amount}" — this is a caller bug, not a declined payment.`);
  }

  let succeeded;
  if (simulate === 'success') {
    succeeded = true;
  } else if (simulate === 'failure') {
    succeeded = false;
  } else {
    succeeded = Math.random() >= config.payment.mockFailureRate;
  }

  if (succeeded) {
    return { success: true, transactionId: generateMockTransactionId(), failureReason: null };
  }

  return {
    success: false,
    transactionId: null,
    failureReason: simulate === 'failure'
      ? 'Simulated failure (explicit dev/test override).'
      : 'Mock gateway declined the charge (MOCK_PAYMENT_FAILURE_RATE).',
  };
}

module.exports = { charge, sanitizeSimulateOverride };
