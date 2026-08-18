/**
 * seeds/admins.seed.js
 *
 * Seeds the 2 admin accounts spec1.md requires, both with identical full
 * permissions, created only via this one-time seed script — there is no
 * public/UI path to create an admin (see spec1.md's "Admin Auth" section).
 *
 * Placeholder credentials are intentionally simple/known so you can log in
 * immediately after seeding — CHANGE THESE before anything resembling a
 * real deployment. They're printed to the console on creation as a
 * reminder of what was just seeded; nowhere else are they stored in
 * plaintext (the DB only ever holds the bcrypt hash).
 *
 * `totp_secret` is left NULL / `totp_enabled` false for both — 2FA setup
 * (spec1.md requires TOTP on every admin login) is a Checkpoint 8 flow
 * (scan a QR code on first login), not something a seed script should
 * pre-generate, since the human running Checkpoint 8's setup screen needs
 * to actually scan the real secret with their own authenticator app.
 *
 * Idempotent per-admin: an admin whose email already exists is skipped,
 * not reset — re-running `npm run seed` won't clobber an admin who has
 * already gone through 2FA setup and changed their password.
 */

const bcrypt = require('bcrypt');

const BCRYPT_SALT_ROUNDS = 12;

const ADMINS = [
  { email: 'admin1@affiliatecourseplatform.local', password: 'ChangeMe123!' },
  { email: 'admin2@affiliatecourseplatform.local', password: 'ChangeMe123!' },
];

/**
 * @param {import('pg').PoolClient} client
 */
async function seedAdmins(client) {
  for (const admin of ADMINS) {
    const existing = await client.query(
      'SELECT id FROM admins WHERE email = $1',
      [admin.email]
    );

    if (existing.rows.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[seed] Admin ${admin.email} already exists — skipping.`);
      continue;
    }

    const passwordHash = await bcrypt.hash(admin.password, BCRYPT_SALT_ROUNDS);
    await client.query(
      'INSERT INTO admins (email, password_hash) VALUES ($1, $2)',
      [admin.email, passwordHash]
    );

    // eslint-disable-next-line no-console
    console.log(
      `[seed] Admin created: ${admin.email} / ${admin.password} ` +
      '— CHANGE THIS PASSWORD before real use. 2FA setup happens on first ' +
      'admin login (Checkpoint 8).'
    );
  }
}

module.exports = { seedAdmins };
