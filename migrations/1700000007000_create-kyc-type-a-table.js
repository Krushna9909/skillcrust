/**
 * migrations/1700000007000_create-kyc-type-a-table.js
 *
 * Type A KYC (bank withdrawal) per spec1.md: account holder name, account
 * number, IFSC code, bank name, Aadhaar number, PAN number.
 *
 * Only `account_number`, `aadhaar_number`, and `pan_number` are in spec1.md's
 * "encrypted at rest" list — `account_holder_name`, `ifsc_code`, and
 * `bank_name` are stored plain. The three encrypted columns are named
 * `*_encrypted` and typed `text` (not `varchar`) since AES-256 ciphertext
 * (base64-encoded) is longer than the plaintext and shouldn't be
 * length-capped to the plaintext's natural size. The actual
 * encrypt/decrypt/mask utility module is Checkpoint 4's job — this
 * migration only shapes the columns per spec1.md's field-level-encryption
 * requirement so Checkpoint 4 doesn't need a schema change.
 *
 * `user_id` is UNIQUE — one Type A submission per user. Per spec1.md, KYC
 * is "auto-approved on submission" with no manual review queue, so a
 * resubmission is modeled as an UPDATE (upsert) of this single row, not a
 * new row — Checkpoint 4 should use `ON CONFLICT (user_id) DO UPDATE`.
 * `status` exists (default 'approved') for forward-compatibility in case a
 * manual review step is ever added later, even though nothing sets it to
 * anything else today.
 */

exports.up = (pgm) => {
  pgm.createTable('kyc_type_a', {
    id: 'id',

    user_id: {
      type: 'integer',
      notNull: true,
      unique: true,
      references: '"users"',
      onDelete: 'RESTRICT',
    },

    account_holder_name: { type: 'varchar(150)', notNull: true },
    ifsc_code: { type: 'varchar(20)', notNull: true },
    bank_name: { type: 'varchar(150)', notNull: true },

    // AES-256 ciphertext (base64), encrypted/decrypted by Checkpoint 4's
    // utility module using AES_ENCRYPTION_KEY (see .env.example). Never
    // written to logs — see errorHandler.js's file header.
    account_number_encrypted: { type: 'text', notNull: true },
    aadhaar_number_encrypted: { type: 'text', notNull: true },
    pan_number_encrypted: { type: 'text', notNull: true },

    status: { type: 'varchar(20)', notNull: true, default: 'approved' },

    submitted_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('kyc_type_a');
};
