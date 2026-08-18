/**
 * src/services/fraudDetection.js
 *
 * Checkpoint 9: "Same-IP/device signup detection → fraud flag record
 * (visibility only, no auto-block)." IP-based only — see
 * migrations/1700000012000_add-signup-ip-to-users.js's comment for why
 * "device" fingerprinting isn't implemented (no client-side mechanism
 * exists anywhere else in this stack, and spec1.md's own Admin Panel
 * section only actually names "same-IP signups" as the concrete case).
 *
 * Called from auth.controller.js's signup handler, AFTER the account is
 * already fully created and committed — deliberately best-effort and
 * NEVER allowed to fail the signup response. Fraud detection is a
 * secondary, visibility-only concern (spec1.md is explicit: "accounts
 * are not auto-blocked"); a bug or transient DB hiccup in this code path
 * should never be the reason a legitimate signup fails. The caller wraps
 * this in its own try/catch for exactly that reason.
 *
 * *** THRESHOLD/WINDOW — judgment calls, not spec numbers ***
 * spec1.md only says "multiple accounts register from the same IP/device
 * in a short window," no specific numbers. `SIGNUP_THRESHOLD = 3` and
 * `WINDOW_HOURS = 24` are reasonable starting points — 1-2 signups from
 * one IP is completely normal (a shared home/office network, a mobile
 * carrier NAT), 3+ within a day starts looking coordinated. Flag if
 * you'd like these tuned; they're the two constants below, nothing else
 * needs to change to adjust them.
 *
 * *** DEDUP ***
 * Without a dedup check, EVERY signup from an already-over-threshold IP
 * would create another near-identical flag (4th signup flags again, 5th
 * flags again...), flooding the admin view with noise instead of signal.
 * `FLAG_DEDUP_WINDOW_HOURS` suppresses a repeat flag for the same IP
 * within that window — the admin still sees the FIRST flag (with
 * whatever the full up-to-date `user_ids` list was at that moment), just
 * not a new one for every subsequent signup from the same IP.
 */

const { pool } = require('../config/db');
const fraudFlagModel = require('../models/fraudFlag.model');

const SIGNUP_THRESHOLD = 3;
const WINDOW_HOURS = 24;
const FLAG_DEDUP_WINDOW_HOURS = 24;
const FLAG_TYPE = 'same_ip_signup';

/**
 * @param {string|null|undefined} ip - the IP the just-completed signup
 *   request came from (req.ip); a falsy value is a no-op, not an error —
 *   there's nothing to correlate without an IP.
 * @returns {Promise<object|null>} the newly-created flag row, or null if
 *   no flag was created (below threshold, or one already exists for this
 *   IP within the dedup window)
 */
async function checkAndFlagSameIpSignups(ip) {
  if (!ip) return null;

  const userIds = await fraudFlagModel.findRecentUserIdsBySignupIp(pool, ip, WINDOW_HOURS);
  if (userIds.length < SIGNUP_THRESHOLD) return null;

  const existingFlag = await fraudFlagModel.findRecentFlagForIp(pool, ip, FLAG_TYPE, FLAG_DEDUP_WINDOW_HOURS);
  if (existingFlag) return null;

  return fraudFlagModel.createFlag(pool, {
    flagType: FLAG_TYPE,
    ipAddress: ip,
    userIds,
    details: { signupCount: userIds.length, windowHours: WINDOW_HOURS },
  });
}

module.exports = { checkAndFlagSameIpSignups, SIGNUP_THRESHOLD, WINDOW_HOURS };
