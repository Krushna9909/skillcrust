/**
 * src/middleware/captcha.middleware.js
 *
 * *** STUB — no CAPTCHA provider has been chosen yet ***
 * (checkpoint.md's standing open item: "CAPTCHA provider: spec says
 * 'simple CAPTCHA,' no provider named — Checkpoint 2 should pick one
 * (e.g. hCaptcha/reCAPTCHA free tier) and flag the choice." This
 * checkpoint stubs the HOOK rather than picking one — real verification
 * needs a provider secret key + an outbound HTTP call to that provider's
 * verify endpoint, which is a decision the human should make (hCaptcha vs
 * reCAPTCHA vs Turnstile all have different privacy/cost tradeoffs), not
 * something to guess at.
 *
 * Behavior, gated on whether CAPTCHA_SECRET_KEY is set (see .env.example):
 *   - NOT set (the expected case right now): passes every request through
 *     unconditionally, logging a warning once per process start so it's
 *     obvious in server logs that CAPTCHA is effectively off. Signup/login
 *     still work end-to-end without a `captchaToken` in the request body.
 *   - SET: the frontend is presumably now sending a real captcha token,
 *     but this stub still has no provider-specific verify call to make —
 *     rather than silently accept-anything (which would be worse than no
 *     CAPTCHA at all, since it'd look protected but isn't) or guess at a
 *     provider's API shape, it responds 501 so the gap is loud, not
 *     silent. Whoever picks the provider should replace the body of the
 *     `if (config.captcha.enabled)` branch with a real verify call.
 */

const config = require('../config/env');

let warnedOnce = false;

function verifyCaptcha(req, res, next) {
  if (!config.captcha.enabled) {
    if (!warnedOnce) {
      // eslint-disable-next-line no-console
      console.warn(
        '[captcha] CAPTCHA_SECRET_KEY not set — CAPTCHA verification is ' +
        'stubbed/disabled. See checkpoint.md open items before real launch.'
      );
      warnedOnce = true;
    }
    return next();
  }

  const err = new Error(
    'CAPTCHA_SECRET_KEY is set, but no CAPTCHA provider has been implemented yet ' +
    '— see Checkpoint 2 in checkpoint.md (standing open item: provider choice).'
  );
  err.statusCode = 501;
  return next(err);
}

module.exports = verifyCaptcha;
