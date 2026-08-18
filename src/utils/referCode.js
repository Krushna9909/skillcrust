/**
 * src/utils/referCode.js
 *
 * Generates the unique refer code every new user gets on signup
 * (spec1.md: "Every user gets a unique refer code on account creation").
 * Server-generated and random — never chosen by the user — which is also
 * what makes the "self-referral blocked" rule structurally sound (see
 * auth.controller.js's signup handler for the full reasoning): a brand
 * new user cannot possibly know their own code in advance to submit it as
 * their own referrer.
 *
 * Format: 8 characters, uppercase letters + digits, excluding visually
 * ambiguous characters (0/O, 1/I/L) to keep codes easy to read aloud or
 * retype from a screenshot. `COMPANY` itself is excluded from the random
 * alphabet space by construction (it's 7 chars, this generator always
 * produces 8), but reserved words are still explicitly rejected below as
 * a defensive check in case the format ever changes.
 */

const crypto = require('crypto');

const CODE_LENGTH = 8;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const RESERVED_CODES = new Set(['COMPANY']);
const MAX_ATTEMPTS = 10;

function generateCandidate() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

/**
 * @param {import('pg').PoolClient} client
 * @returns {Promise<string>} a refer code confirmed unique in `users`
 *   at the moment of checking. Caller still relies on the DB's UNIQUE
 *   constraint on `refer_code` as the final word — this is a
 *   best-effort pre-check to avoid needlessly retrying the whole signup
 *   transaction on the (very rare) collision, not a replacement for it.
 */
async function generateUniqueReferCode(client) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = generateCandidate();
    if (RESERVED_CODES.has(candidate)) continue; // eslint-disable-line no-continue

    // eslint-disable-next-line no-await-in-loop
    const existing = await client.query(
      'SELECT 1 FROM users WHERE refer_code = $1',
      [candidate]
    );
    if (existing.rows.length === 0) {
      return candidate;
    }
  }

  // With a ~32^8 candidate space this should never happen in practice —
  // if it does, something is very wrong (e.g. the alphabet/length got
  // shrunk accidentally), so fail loudly instead of returning a
  // possibly-colliding code.
  throw new Error('Could not generate a unique refer code after multiple attempts.');
}

module.exports = { generateUniqueReferCode, RESERVED_CODES };
