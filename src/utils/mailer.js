/**
 * src/utils/mailer.js
 *
 * *** STUB — no transactional email provider has been chosen yet ***
 * (checkpoint.md's standing open item: "Transactional email service:
 * needed for password reset links — not named in spec. Checkpoint 2
 * should pick one (or stub it) and flag the choice.") This checkpoint
 * stubs it rather than picking one, since committing to a provider
 * (SendGrid/Postmark/SES/etc.) is a real decision with cost/deliverability
 * tradeoffs the human should make, not something to guess at.
 *
 * Behavior:
 *   - Outside production: logs the email's contents to the console
 *     (prefixed `[mailer:stub]`) instead of sending anything. This is
 *     enough to develop/test the forgot-password flow end-to-end locally
 *     — copy the logged reset link straight out of the terminal.
 *   - In production: THROWS, rather than silently pretending to send.
 *     Silently no-op-ing a password-reset email in a real deployment
 *     would be a much worse failure mode (users locked out with no
 *     visible error) than a loud, obvious "mailer not configured" crash
 *     that gets noticed immediately.
 *
 * When a provider is chosen, this is the one file to change — every
 * caller (just password-reset for now) already goes through
 * `sendMail({ to, subject, text })`.
 */

const config = require('../config/env');

async function sendMail({ to, subject, text }) {
  if (config.isProduction) {
    throw new Error(
      'mailer.sendMail: no email provider is configured yet (MAIL_SERVICE_API_KEY / ' +
      'provider choice is a standing open item from Checkpoint 2 — see checkpoint.md). ' +
      'Refusing to silently drop this email in production.'
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `[mailer:stub] Would send email\n  To: ${to}\n  Subject: ${subject}\n  Body:\n${text}\n`
  );
}

module.exports = { sendMail };
