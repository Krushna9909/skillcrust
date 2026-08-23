/**
 * migrations/1700000013000_add-payout-details-to-withdrawals.js
 *
 * The wallet withdrawal form now collects the destination payout details
 * (bank: holder name/email/account/IFSC, UPI: holder name/email/UPI id)
 * at request time, so the admin can review them and — on approval — the
 * server can hand them straight to the CreatorFeed payout API.
 *
 * `account_number_encrypted` follows the same AES-256-GCM at-rest rule as
 * the KYC tables (src/utils/encryption.js); the rest are non-sensitive
 * identifiers kept in plain text so the admin list can render them.
 */

exports.up = (pgm) => {
  pgm.addColumns('withdrawals', {
    holder_name: { type: 'varchar(120)', notNull: false },
    holder_email: { type: 'varchar(255)', notNull: false },
    account_number_encrypted: { type: 'text', notNull: false },
    account_number_last4: { type: 'varchar(4)', notNull: false },
    ifsc_code: { type: 'varchar(11)', notNull: false },
    upi_id: { type: 'varchar(120)', notNull: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('withdrawals', [
    'holder_name',
    'holder_email',
    'account_number_encrypted',
    'account_number_last4',
    'ifsc_code',
    'upi_id',
  ]);
};
