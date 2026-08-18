/**
 * src/config/env.js
 *
 * Single place that loads and validates environment variables. Every other
 * file in the app should import `config` from here instead of reading
 * `process.env` directly — that way if a required var is missing, we fail
 * fast at startup with a clear error, instead of failing later with a
 * confusing runtime bug somewhere deep in a request handler.
 *
 * CONVENTION: when a later checkpoint introduces a new required env var,
 * add it to `REQUIRED_VARS` below and to `.env.example`, and export it from
 * `config`. Never rename an existing key here without updating every file
 * that imports it (and flagging the rename in checkpoint.md).
 */

require('dotenv').config();

// Vars that must be present for the app to boot at all. Checkpoint 0 only
// needs the server/db/auth basics — later checkpoints (KYC keys, payment
// gateway mode, etc.) will extend this list when they add real logic that
// depends on those vars.
const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'COOKIE_SECRET',
  'AES_ENCRYPTION_KEY',
  'ADMIN_JWT_SECRET',
];

function assertRequiredVarsPresent() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    // Fail loudly and immediately — better than a silent undefined deep in
    // the app later.
    // eslint-disable-next-line no-console
    console.error(
      `[config/env] Missing required environment variable(s): ${missing.join(', ')}\n` +
      'Copy .env.example to .env and fill these in before starting the server.'
    );
    process.exit(1);
  }
}

/**
 * Checkpoint 4: AES-256-GCM needs exactly a 32-byte key (see
 * src/utils/encryption.js). Checked at boot, same "fail fast and loud"
 * philosophy as `assertRequiredVarsPresent` — a wrong-length key should
 * never get the chance to silently produce broken ciphertext the first
 * time someone submits KYC.
 */
function assertEncryptionKeyValid() {
  let decoded;
  try {
    decoded = Buffer.from(process.env.AES_ENCRYPTION_KEY, 'base64');
  } catch (err) {
    decoded = Buffer.alloc(0);
  }
  if (decoded.length !== 32) {
    // eslint-disable-next-line no-console
    console.error(
      '[config/env] AES_ENCRYPTION_KEY must be a base64-encoded 32-byte value ' +
      '(required for AES-256). Generate one with:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
    process.exit(1);
  }
}

assertRequiredVarsPresent();
assertEncryptionKeyValid();

/**
 * Checkpoint 8: admin sessions use a DIFFERENT secret from regular users
 * (see src/utils/adminAuthToken.js's file header for why) — if someone
 * sets ADMIN_JWT_SECRET to the exact same value as JWT_SECRET, that
 * separation is weakened (not broken outright, since cookie names still
 * differ, but weakened enough to fail loudly on rather than allow
 * silently). Same "fail fast" philosophy as the checks above.
 */
function assertAdminSecretIsDistinct() {
  if (process.env.ADMIN_JWT_SECRET === process.env.JWT_SECRET) {
    // eslint-disable-next-line no-console
    console.error(
      '[config/env] ADMIN_JWT_SECRET must be different from JWT_SECRET — ' +
      'using the same value weakens the separation between admin and user ' +
      'sessions (see src/utils/adminAuthToken.js). Generate a distinct one with:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
    process.exit(1);
  }
}

assertAdminSecretIsDistinct();

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT, 10) || 4000,

  db: {
    connectionString: process.env.DATABASE_URL,
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    cookieSecret: process.env.COOKIE_SECRET,
  },

  // Checkpoint 2: CAPTCHA is stubbed until a provider is chosen (see
  // src/middleware/captcha.middleware.js and checkpoint.md's open items).
  // `enabled` just reflects whether a key has been set — it does NOT mean
  // real verification is implemented yet.
  captcha: {
    enabled: Boolean(process.env.CAPTCHA_SECRET_KEY),
    secretKey: process.env.CAPTCHA_SECRET_KEY || null,
  },

  // Checkpoint 2: used to build links inside emails (password reset) and
  // Checkpoint 7's affiliate links. Checkpoint 10 made the frontend
  // same-origin with the API (served via express.static from this same
  // process/port) — so this should just match wherever this server itself
  // is reachable. Default fixed here to match `port` below (was `:3000`,
  // a stale leftover from before Checkpoint 10's same-origin decision —
  // a real bug, since it silently produced wrong-origin affiliate links
  // in local dev; caught and fixed in Checkpoint 11).
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4000',

  // Checkpoint 3: mock payment gateway. `mode` selects the implementation
  // in src/services/payment/index.js — only 'mock' exists right now: a
  // real gateway later means registering a new module there and flipping
  // this var, not touching any calling code (see README's "Mock payment /
  // payout gateway pattern"). `mockFailureRate` lets the mock gateway
  // randomly fail a fraction of charges with NO explicit override (0 =
  // always succeeds by default, which is what every other checkpoint's
  // testing wants) — independent of the per-request `simulate` override
  // (dev/test only, see src/services/payment/mockGateway.js).
  payment: {
    mode: process.env.PAYMENT_GATEWAY_MODE || 'mock',
    mockFailureRate: Number.isFinite(parseFloat(process.env.MOCK_PAYMENT_FAILURE_RATE))
      ? parseFloat(process.env.MOCK_PAYMENT_FAILURE_RATE)
      : 0,
  },

  // Checkpoint 5: mock payout gateway — same shape/reasoning as `payment`
  // above, per spec1.md's "mirrors the mock purchase gateway." Selects
  // the implementation in src/services/payout/index.js.
  payout: {
    mode: process.env.PAYOUT_GATEWAY_MODE || 'mock',
    mockFailureRate: Number.isFinite(parseFloat(process.env.MOCK_PAYOUT_FAILURE_RATE))
      ? parseFloat(process.env.MOCK_PAYOUT_FAILURE_RATE)
      : 0,
  },

  // Checkpoint 4: field-level AES-256-GCM encryption for KYC's sensitive
  // fields (Aadhaar/PAN/bank account number). Required at boot (see
  // `assertEncryptionKeyValid` above) — never hardcoded, per spec1.md.
  encryption: {
    aesKey: process.env.AES_ENCRYPTION_KEY,
  },

  // Checkpoint 8: admin sessions — deliberately separate secret/expiry
  // from regular users (see src/utils/adminAuthToken.js). Shorter default
  // expiry than users' 7d, since admins can view all financial/KYC data.
  adminAuth: {
    jwtSecret: process.env.ADMIN_JWT_SECRET,
    jwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '4h',
  },
};

module.exports = config;
