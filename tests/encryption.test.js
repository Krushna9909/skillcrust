/**
 * tests/encryption.test.js
 *
 * Checkpoint 4's encryption/masking utility (src/utils/encryption.js) is
 * pure — no database involved — so these are genuine unit tests, unlike
 * tests/rewardEngine.test.js's DB-backed integration tests. Still uses
 * Node's built-in `node:test` (no new dependency), matching Checkpoint 3's
 * established pattern.
 *
 * *** HOW TO RUN ***
 *   npm test
 * Needs a valid `.env` present (same as every other checkpoint) — NOT
 * because this file touches the database, but because requiring
 * src/config/env.js (transitively, via src/utils/encryption.js) runs its
 * required-vars check as a module-load side effect and exits the process
 * if anything is missing, including vars unrelated to encryption (e.g.
 * DATABASE_URL). It does NOT need Postgres actually running.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { encryptField, decryptField, maskLast4 } = require('../src/utils/encryption');

test('encrypt then decrypt returns the original plaintext, for a variety of KYC-shaped values', () => {
  const samples = [
    'ABCDE1234F', // PAN-shaped
    '123456789012', // Aadhaar-shaped
    '000123456789012', // bank account number-shaped
    'a', // single character (shorter than the auth tag / IV, worth checking explicitly)
    '', // empty string
    'Name With Spaces & Punctuation, Ltd.',
  ];

  for (const plaintext of samples) {
    const ciphertext = encryptField(plaintext);
    assert.equal(typeof ciphertext, 'string');
    assert.notEqual(ciphertext, plaintext, 'ciphertext should never equal the plaintext');
    assert.equal(decryptField(ciphertext), plaintext);
  }
});

test('encrypting the same plaintext twice produces different ciphertext (fresh random IV per call)', () => {
  const plaintext = 'ABCDE1234F';
  const first = encryptField(plaintext);
  const second = encryptField(plaintext);

  assert.notEqual(first, second, 'two encryptions of the same value must not be identical — otherwise equal ciphertext would leak that two users share a value even without the key');
  assert.equal(decryptField(first), plaintext);
  assert.equal(decryptField(second), plaintext);
});

test('encryptField and decryptField pass nullish values straight through', () => {
  assert.equal(encryptField(null), null);
  assert.equal(encryptField(undefined), null);
  assert.equal(decryptField(null), null);
  assert.equal(decryptField(undefined), null);
});

test('decryptField throws a generic, value-free error on malformed input (never leaks what was passed in)', () => {
  const malformedInputs = ['not-the-right-format', 'only:two-parts', ''];

  for (const bad of malformedInputs) {
    assert.throws(() => decryptField(bad), (err) => {
      assert.ok(err instanceof Error);
      assert.ok(!err.message.includes(bad) || bad === '', 'error message must not echo the malformed input back');
      return true;
    });
  }
});

test('decryptField throws (does not silently return garbage) when ciphertext has been tampered with', () => {
  const ciphertext = encryptField('ABCDE1234F');
  const [iv, authTag, ct] = ciphertext.split(':');
  // Flip the ciphertext portion — GCM's auth tag must catch this rather
  // than decrypting to some other, wrong plaintext silently.
  const tampered = [iv, authTag, Buffer.from(ct, 'base64').reverse().toString('base64')].join(':');

  assert.throws(() => decryptField(tampered));
});

test('maskLast4 keeps exactly the last 4 characters, masking the rest', () => {
  assert.equal(maskLast4('123456789012'), '********9012'); // Aadhaar-shaped, 12 digits
  assert.equal(maskLast4('ABCDE1234F'), '******234F'); // PAN-shaped, mixed alnum
  assert.equal(maskLast4('000123456789012'), '***********9012'); // account-number-shaped
});

test('maskLast4 handles strings 4 characters or shorter by masking entirely (no negative-length slice)', () => {
  assert.equal(maskLast4('abcd'), '****');
  assert.equal(maskLast4('ab'), '**');
  assert.equal(maskLast4('a'), '*');
});

test('maskLast4 returns null for nullish/empty input rather than throwing', () => {
  assert.equal(maskLast4(null), null);
  assert.equal(maskLast4(undefined), null);
  assert.equal(maskLast4(''), null);
});
