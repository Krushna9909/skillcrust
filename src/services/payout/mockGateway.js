/**
 * src/services/payout/mockGateway.js
 *
 * The payout-side twin of src/services/payment/mockGateway.js — same
 * shape, same reasoning, deliberately kept as close to identical as the
 * different domain (payout vs charge) allows, since spec1.md explicitly
 * says the payout gateway "mirrors the mock purchase gateway." Anything
 * that looks copy-pasted from that file IS copy-pasted on purpose, for
 * consistency; see that file's more detailed comments for the full
 * reasoning behind the `simulate` override / `MOCK_..._FAILURE_RATE`
 * pattern, not repeated verbatim here.
 *
 * No real money moves — resolves synchronously-ish, never throws for a
 * "normal" declined payout, only for genuinely invalid input (caller bug).
 */

const crypto = require('crypto');
const config = require('../../config/env');

function sanitizeSimulateOverride(value) {
  if (config.isProduction) return undefined;
  if (value === 'success' || value === 'failure') return value;
  return undefined;
}

function generateMockPayoutId() {
  return `MOCK-PAYOUT-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

/**
 * @param {object} params
 * @param {number|string} params.amount
 * @param {'upi'|'bank'} params.method - informational only for the mock;
 *   a real payout provider module would very much need this to route the
 *   payout correctly
 * @param {'success'|'failure'|undefined} [params.simulate] - already-
 *   sanitized override (callers should pass through
 *   `sanitizeSimulateOverride`'s result, not a raw request body value)
 * @returns {Promise<{ success: boolean, payoutId: string|null, failureReason: string|null }>}
 */
async function payout({ amount, method, simulate } = {}) {
  if (!(Number(amount) > 0)) {
    throw new Error(`mockGateway.payout: invalid amount "${amount}" — this is a caller bug, not a declined payout.`);
  }
  if (method !== 'upi' && method !== 'bank') {
    throw new Error(`mockGateway.payout: invalid method "${method}" — this is a caller bug, not a declined payout.`);
  }

  let succeeded;
  if (simulate === 'success') {
    succeeded = true;
  } else if (simulate === 'failure') {
    succeeded = false;
  } else {
    succeeded = Math.random() >= config.payout.mockFailureRate;
  }

  if (succeeded) {
    return { success: true, payoutId: generateMockPayoutId(), failureReason: null };
  }

  return {
    success: false,
    payoutId: null,
    failureReason: simulate === 'failure'
      ? 'Simulated failure (explicit dev/test override).'
      : 'Mock payout gateway declined the payout (MOCK_PAYOUT_FAILURE_RATE).',
  };
}

module.exports = { payout, sanitizeSimulateOverride };
