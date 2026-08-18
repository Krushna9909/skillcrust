/**
 * src/services/payment/index.js
 *
 * The single interface every caller (rewardEngine.js) uses — never import
 * mockGateway.js directly from outside this directory. This is the
 * "swap to a real gateway later without rearchitecting" seam spec1.md
 * asks for: adding Razorpay later means writing `razorpayGateway.js`
 * behind the same `charge()` shape, registering it in the switch below,
 * and flipping `PAYMENT_GATEWAY_MODE=razorpay` — no changes anywhere else
 * in the app.
 *
 * `sanitizeSimulateOverride` is re-exported as-is (mock-specific today,
 * but every future gateway module implementing this interface should
 * export the same function name, even if a real gateway's version always
 * just returns `undefined` — real gateways can't be told to fake success).
 */

const config = require('../../config/env');
const mockGateway = require('./mockGateway');

function getGateway() {
  switch (config.payment.mode) {
    case 'mock':
      return mockGateway;
    default:
      throw new Error(
        `Unsupported PAYMENT_GATEWAY_MODE: "${config.payment.mode}". Only "mock" is ` +
        'implemented (Checkpoint 3) — add a new gateway module under src/services/payment/ ' +
        'and register it in src/services/payment/index.js when ready.'
      );
  }
}

async function charge(params) {
  return getGateway().charge(params);
}

function sanitizeSimulateOverride(value) {
  return getGateway().sanitizeSimulateOverride(value);
}

module.exports = { charge, sanitizeSimulateOverride };
