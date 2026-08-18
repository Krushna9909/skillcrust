/**
 * seeds/companyAccount.seed.js
 *
 * Seeds the one special system account, refer code `COMPANY`, that
 * spec1.md's "Orphan/root referral handling" section requires:
 *   - Default referrer for anyone signing up with an invalid/missing code.
 *   - Automatic recipient of any reward tier that would otherwise have no
 *     valid recipient (see reward_transactions table comments).
 * This guarantees every reward always resolves to *some* account.
 *
 * `referrer_id` is left NULL — this is the one row in `users` allowed to
 * have no referrer (it's the root of the whole tree, not referred by
 * anyone). See users table migration comments.
 *
 * `password_hash` is set to the bcrypt hash of a long random string that is
 * generated, hashed, and then thrown away — never logged, never stored in
 * plaintext anywhere. This keeps `password_hash NOT NULL` true for every
 * row (no nullable-password edge case in later login-query logic) while
 * making the COMPANY account's password practically unguessable. Real
 * login attempts against this account should be blocked at the
 * application layer by checking `is_system_account`, not relied on the
 * password being unguessable alone — flagging this for whoever builds
 * Checkpoint 2's login handler.
 *
 * Idempotent: if a `COMPANY` row already exists, this is a no-op (does
 * NOT reset its password hash or id on re-seed, so re-running `npm run
 * seed` during development doesn't invalidate anything already pointing at
 * it as a referrer).
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');

const COMPANY_REFER_CODE = 'COMPANY';
const BCRYPT_SALT_ROUNDS = 12;

/**
 * @param {import('pg').PoolClient} client
 */
async function seedCompanyAccount(client) {
  const existing = await client.query(
    'SELECT id FROM users WHERE refer_code = $1',
    [COMPANY_REFER_CODE]
  );

  if (existing.rows.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[seed] COMPANY account already exists — skipping.');
    return;
  }

  const throwawayPassword = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(throwawayPassword, BCRYPT_SALT_ROUNDS);

  await client.query(
    `INSERT INTO users
       (refer_code, referrer_id, full_name, email, phone, password_hash,
        state, is_system_account, is_active)
     VALUES ($1, NULL, $2, $3, $4, $5, $6, true, true)`,
    [
      COMPANY_REFER_CODE,
      'Company (System Account)',
      // Placeholder contact fields — not a real inbox/number, just needs to
      // satisfy the NOT NULL + UNIQUE constraints shared with real users.
      // Replace via the admin panel if the company ever needs a real
      // support email surfaced somewhere.
      'company@internal.invalid',
      '0000000000',
      passwordHash,
      'Maharashtra',
    ]
  );

  // eslint-disable-next-line no-console
  console.log('[seed] COMPANY system account created.');
}

module.exports = { seedCompanyAccount, COMPANY_REFER_CODE };
