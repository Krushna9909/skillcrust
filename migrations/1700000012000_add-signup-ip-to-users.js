/**
 * migrations/1700000012000_add-signup-ip-to-users.js
 *
 * Checkpoint 9's "same-IP/device signup detection" needs somewhere to
 * look up "which users signed up from IP X" — this column is that. The
 * first schema change since Checkpoint 1's original 11 migrations.
 *
 * Nullable: existing rows (COMPANY, anything seeded/admin-created via
 * Checkpoint 8's `POST /admin/users`, which never captures a request IP
 * at all) have no meaningful signup IP. Only real self-service signups
 * (Checkpoint 2's `POST /auth/signup`) populate this — see
 * auth.controller.js's signup handler and user.model.js's `createUser`.
 *
 * `varchar(45)` matches `fraud_flags.ip_address`'s own sizing (fits
 * IPv6). Indexed since the whole point of storing this is the "count
 * recent signups sharing this IP" query
 * (src/services/fraudDetection.js) — that query would be a full table
 * scan without it.
 *
 * This is NOT the "device" half of "same-IP/device" — device
 * fingerprinting would need a client-side library/header that doesn't
 * exist anywhere else in this stack, and spec1.md doesn't name one (only
 * "same-IP/device signups" as the phenomenon to watch for, then "same-IP"
 * specifically in the Admin Panel section's own description: "fraud-flag
 * alerts (same-IP signups)"). Flagged clearly in checkpoint.md — this
 * checkpoint implements IP-based detection only.
 */

exports.up = (pgm) => {
  pgm.addColumn('users', {
    signup_ip: { type: 'varchar(45)', notNull: false },
  });

  pgm.createIndex('users', 'signup_ip');
};

exports.down = (pgm) => {
  pgm.dropColumn('users', 'signup_ip');
};
