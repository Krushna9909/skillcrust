/**
 * src/services/payout/index.js
 *
 * The payout-side twin of src/services/payment/index.js — same
 * swap-seam pattern. The single interface every caller
 * (src/services/withdrawalEngine.js) uses; never import mockGateway.js
 * directly from outside this directory. Adding a real payout provider
 * (Razorpay Payouts, Cashfree Payouts, etc.) later means writing a new
 * module behind this same `payout()` shape, registering it below, and
 * flipping `PAYOUT_GATEWAY_MODE` — no changes anywhere else in the app,
 * per spec1.md's explicit requirement for this.
 */

const config = require('../../config/env');
const mockGateway = require('./mockGateway');

function getGateway() {
  switch (config.payout.mode) {
    case 'mock':
      return mockGateway;
    default:
      throw new Error(
        `Unsupported PAYOUT_GATEWAY_MODE: "${config.payout.mode}". Only "mock" is ` +
        'implemented (Checkpoint 5) — add a new gateway module under src/services/payout/ ' +
        'and register it in src/services/payout/index.js when ready.'
      );
  }
}

async function payout(params) {
  return getGateway().payout(params);
}

function sanitizeSimulateOverride(value) {
  return getGateway().sanitizeSimulateOverride(value);
}

module.exports = { payout, sanitizeSimulateOverride };
