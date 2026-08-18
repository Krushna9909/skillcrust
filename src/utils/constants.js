/**
 * src/utils/constants.js
 *
 * `COMPANY_REFER_CODE` was previously duplicated as a local constant in
 * both `seeds/companyAccount.seed.js` (Checkpoint 1) and
 * `auth.controller.js` (Checkpoint 2). Checkpoint 3's reward engine needs
 * the exact same literal a third time to resolve the COMPANY fallback for
 * the indirect-tier reward — three independent copies of the same string
 * is a real risk of silent drift, so this checkpoint pulls it into one
 * shared constant and updates `auth.controller.js` to import from here
 * instead of re-declaring it. `seeds/companyAccount.seed.js` is left as-is
 * (a one-time script, and Checkpoint 1's shipped work isn't touched
 * without reason) — its own local copy is functionally identical, just
 * not physically deduplicated.
 */

const COMPANY_REFER_CODE = 'COMPANY';

module.exports = { COMPANY_REFER_CODE };
