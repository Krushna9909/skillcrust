# Affiliate Course Platform

Course platform selling 6 fixed courses with a 2-tier affiliate/referral
rewards program. See `spec1.md` for the full product spec and
`checkpoint.md` for the build plan / current progress.

This README is the working reference for the conventions established in
Checkpoint 0. It's mirrored (in summary form) into `checkpoint.md`'s
"Global Conventions" section — if the two ever disagree, this README is the
more detailed/authoritative version.

---

## Getting started

```bash
npm install
cp .env.example .env    # then fill in real values
npm run dev              # starts the server with nodemon
```

The server will refuse to start if a required env var is missing (see
`src/config/env.js`), and will exit with a clear error if it can't reach
Postgres. Once Checkpoint 1 adds migrations:

```bash
npm run migrate:up
npm run seed
```

Health check: `GET http://localhost:4000/api/v1/health`

---

## Folder structure

```
src/
  config/       env loading + validation, Postgres pool
  routes/       Express routers, one file per resource area, thin — just
                route wiring + calling controllers (controllers added from
                Checkpoint 2 onward)
  controllers/  request handlers (business logic entry points) — empty
                until Checkpoint 2+
  models/       DB query functions per table/entity — empty until
                Checkpoint 1+
  middleware/   auth/admin gating, error handling, rate limiting (added
                per-checkpoint as needed)
  utils/        shared helpers (e.g. encryption, validation regexes) —
                empty until the checkpoint that needs them
  app.js        Express app construction (middleware stack + route mount)
  server.js     process entry point (DB check, listen, graceful shutdown)

migrations/     node-pg-migrate migration files (Checkpoint 1+)
seeds/          one-time seed scripts (Checkpoint 1+)
uploads/        local disk storage for KYC docs / profile photos — never
                served via express.static, always through a protected,
                ownership-checked route (first built in Checkpoint 6)
```

---

## Naming conventions

- **JS files:** `camelCase.js` for plain modules (`env.js`, `db.js`).
  Resource-scoped files use a dotted suffix indicating their layer:
  `auth.routes.js`, `auth.controller.js` (Checkpoint 2+), `user.model.js`
  (Checkpoint 1+), `auth.middleware.js`.
- **Folders:** all lowercase, no separators (`config`, `routes`, `middleware`).
- **Postgres tables:** `snake_case`, plural — `users`, `admins`, `courses`,
  `withdrawals`, `kyc_type_a`, `kyc_type_b`, `fraud_flags`, etc. (exact list
  finalized in Checkpoint 1).
- **Postgres columns:** `snake_case` — `created_at`, `referrer_id`,
  `refer_code`, etc.
- **API routes:** versioned and kebab-case, all under `/api/v1/...`. Grouped
  by resource: `/api/v1/auth/...`, `/api/v1/user/...`, `/api/v1/wallet/...`,
  `/api/v1/kyc/...`, `/api/v1/admin/...`, `/api/v1/courses/...`.
- **Env vars:** `SCREAMING_SNAKE_CASE`. `.env.example` is append-only across
  checkpoints — see the comment block at the top of that file.

---

## Database access — decision & rationale

Raw `pg` driver (connection pool in `src/config/db.js`) + hand-written SQL
migrations via `node-pg-migrate`, **not** a full ORM (Prisma/Sequelize/etc).

Why, for whoever extends this later: the schema is small and fixed (~9-10
tables per spec1.md), so an ORM's modeling layer isn't buying much, and the
reward engine (Checkpoint 3) needs precise multi-row wallet-credit
transactions across up to 3 accounts per purchase — raw SQL inside an
explicit `BEGIN`/`COMMIT` block is easier to audit line-by-line than an
ORM's abstraction over transactions, which matters a lot for money-moving
code. If a future checkpoint has a strong reason to introduce an ORM
anyway, flag that explicitly in `checkpoint.md`'s Progress Log rather than
changing it quietly — it affects every checkpoint that queries the DB.

---

## Auth pattern (implemented starting Checkpoint 2)

- Passwords: bcrypt, 12 salt rounds (`src/utils/password.js`).
- Sessions: JWT (`src/utils/authToken.js`), stored in an **httpOnly**,
  signed cookie named `auth_token` (not localStorage) — JWT signed with
  `JWT_SECRET`, cookie itself independently signed via `COOKIE_SECRET`
  (cookie-parser). 7-day expiry by default (`JWT_EXPIRES_IN`).
- `src/middleware/auth.middleware.js` exports `requireAuth` — verifies the
  cookie's JWT, then does one extra DB lookup per request to confirm the
  account is still active (so an admin deactivating a user, Checkpoint 8,
  takes effect immediately rather than waiting up to 7 days for the
  token to expire on its own). Sets `req.user = { id, referCode,
  isSystemAccount }`. Now wired into every route in `user.routes.js`,
  `wallet.routes.js`, `kyc.routes.js`, and `course.routes.js`'s
  `/:id/lectures` — those handlers are still 501 stubs owned by later
  checkpoints, only the auth gate was added.
- Admin auth is a **completely separate** mechanism, real as of
  Checkpoint 8 (`src/middleware/admin.middleware.js`, `requireAdmin`) —
  checks against the `admins` table, not `users`, via its own JWT secret
  (`ADMIN_JWT_SECRET`) and cookie (`admin_auth_token`). A regular user's
  valid token is rejected by construction (different cookie name
  entirely, different secret). `authToken.js` above is NOT reused for
  admins — see that file's header and `adminAuthToken.js`'s for the full
  reasoning. Full details in the "Admin auth (Checkpoint 8)" section below.
- **Signup + "must purchase a course":** the mock payment gateway doesn't
  exist until Checkpoint 3, so signup creates the user AND a `purchases`
  row for the selected course with `status = 'pending'`, in one
  transaction. The course isn't owned yet (ownership = a `'success'`
  purchase, per Checkpoint 1) — Checkpoint 3's mock gateway is what
  transitions that row to `success`/`failed` and triggers reward
  crediting. See `src/controllers/auth.controller.js`'s file header for
  the full reasoning.
- **Refer codes:** 8-char random uppercase alnum (ambiguous characters
  excluded), generated server-side, never user-chosen
  (`src/utils/referCode.js`). A missing/invalid refer code at signup
  falls back to `COMPANY`, per spec1.md's "Orphan/root referral handling."
- **CAPTCHA:** stubbed (`src/middleware/captcha.middleware.js`) — no
  provider chosen yet, see checkpoint.md's open items. Passes every
  request through as long as `CAPTCHA_SECRET_KEY` is unset.
- **Password reset emails:** stubbed (`src/utils/mailer.js`) — no
  provider chosen yet. Outside production, the email (including the
  reset link) is logged to the console instead of sent.

---

## Mock payment / payout gateway pattern

**Payment (Checkpoint 3 — implemented):**
- `src/services/payment/index.js` is the ONLY interface callers use —
  `charge({ amount, simulate })` and `sanitizeSimulateOverride(value)`.
  Selects the implementation via `PAYMENT_GATEWAY_MODE` (currently only
  `"mock"` is registered — `src/services/payment/mockGateway.js`). Adding
  Razorpay later means writing a new module behind the same interface and
  flipping the env var — no calling code changes.
- `simulate: 'success' | 'failure'` in a request body forces a deterministic
  outcome, for tests/manual QA — silently ignored outside non-production
  (`sanitizeSimulateOverride`), so it can never affect a real deployment.
  `MOCK_PAYMENT_FAILURE_RATE` (default `0`) can instead make the mock
  randomly decline a fraction of charges with no explicit override.
- `src/services/rewardEngine.js`'s `processPendingPurchase(purchaseId, opts)`
  is the ONLY place that calls the gateway and credits rewards — both
  signup (`auth.controller.js`) and `POST /user/purchase`
  (`purchase.controller.js`) call this one function rather than
  duplicating charge+credit logic. See that file's header for its
  two-phase (no-transaction-across-the-gateway-call) design and the exact
  reward math (2-tier walk-up + COMPANY fallback), replicated from
  spec1.md's worked example.

**Payout (Checkpoint 5 — not built yet):** same interface-swap pattern
will apply — `src/services/payout/` exporting
`payout({ amount, method, destination, ... }) -> { success, payoutId, ... }`,
selected via `PAYOUT_GATEWAY_MODE` (documented as an upcoming var in
`.env.example`).

---

## Logging & sensitive data — binding on every future checkpoint

Per spec1.md's KYC section, Aadhaar/PAN/bank account number must never be
logged, and must be encrypted at rest and masked outside entry/admin view.
Concretely:

- `morgan` (request logger) is configured to log method/URL/status only —
  never the request body. Don't change this to log bodies without
  stripping sensitive fields first.
- `src/middleware/errorHandler.js` logs `err.message` — keep error messages
  generic when they touch KYC/financial values (e.g. `"Invalid PAN
  format"`, never the PAN value itself). Checkpoint 4's KYC validators
  (`src/utils/kycValidators.js`) and `src/utils/encryption.js` were
  written and re-checked against this rule specifically — every error
  message either file can throw is value-free.

---

## KYC (Checkpoint 4 — implemented)

- `src/utils/encryption.js` — the "encryption/masking utility module"
  deliverable. AES-256-**GCM** (authenticated — detects tampering/wrong-key
  at decrypt time rather than silently returning garbage), key from
  `AES_ENCRYPTION_KEY` (required at boot, see `src/config/env.js`). Also
  exports `maskLast4`, used on the DECRYPTED plaintext (never on the
  ciphertext column directly).
- `src/utils/kycValidators.js` — PAN/Aadhaar/IFSC/account-number/UPI-ID
  format validators, split out from `src/utils/validators.js` per that
  file's own header comment anticipating this split.
- `src/models/kyc.model.js` — `kyc_type_a`/`kyc_type_b` upsert-on-resubmit
  queries (schema + that decision were both Checkpoint 1's).
- `src/controllers/kyc.controller.js` — `POST /kyc/bank`, `POST /kyc/upi`,
  `GET /kyc`. Every response, including the submission responses
  themselves, masks Aadhaar/PAN/account number to last-4-only — see that
  file's header for the exact reasoning (the stricter of two plausible
  readings of spec1.md's "masked... except entry").
- Auto-approved on submit (`status` defaults to `'approved'` at the DB
  level, Checkpoint 1) — no review-queue code exists or is needed.

---

## Wallet & withdrawals (Checkpoint 5 — implemented)

- `src/services/payout/{mockGateway,index}.js` — the payout-side twin of
  `src/services/payment/`, same swap-seam pattern, selected via
  `PAYOUT_GATEWAY_MODE` (only `"mock"` registered so far).
- `src/services/withdrawalEngine.js` — the withdrawal-side counterpart to
  Checkpoint 3's `rewardEngine.js`. `createAndReserveWithdrawal` atomically
  checks-and-deducts the wallet balance (a single WHERE-guarded UPDATE,
  not a separate check-then-update, so two concurrent requests can't both
  succeed against the same balance) and creates the withdrawal row;
  `processPendingWithdrawal` then does `pending -> processing -> paid`,
  or refunds the reserved amount and goes to `failed` — the gateway call
  itself happens with no DB transaction held open, same principle as the
  reward engine. See that file's header for the full reasoning on
  reserve-before-payout vs. deduct-only-on-success.
- `src/controllers/wallet.controller.js` — `GET /wallet`, `POST
  /wallet/withdraw` (KYC-gated: bank requires Type A, UPI requires Type B,
  checked via Checkpoint 4's `kyc.model.js` helpers), `GET
  /wallet/withdrawals`.
- `src/controllers/admin.controller.js` — **one** handler,
  `getLiabilitySummary` (spec1.md's solvency guard: sum of every user's
  wallet balance). Wired into `GET /admin/liability-summary`
  (CP0 had already earmarked this specific route for CP5) behind
  `requireAdmin`, which is still a Checkpoint 8 stub — so this route is
  fully built but completely unreachable until real admin auth exists.
  This file is NOT a preview of Checkpoint 8's admin controller.

---

## Course content delivery (Checkpoint 6 — implemented)

- `src/middleware/ownership.middleware.js` — the "reusable protected
  file/route middleware" deliverable. `requireOwnership(checkFn)` is a
  FACTORY, not a course-specific check, so it's genuinely reusable for
  KYC docs/profile photos later (spec1.md's "protected routes, not public
  static paths, for anything sensitive") — each just supplies a different
  async predicate. First use: `GET /courses/:id/lectures` gated on the
  logged-in user owning that course.
- `src/models/lecture.model.js` — CRUD + `findLecturesByCourseId`
  (ordered by `sequence_order`). Transaction-agnostic like every other
  model file; `admin.controller.js`'s `reorderLectures` owns the one
  transaction that's needed.
- `src/controllers/lecture.controller.js` — user-facing
  `listLecturesForCourse`, mounted in `course.routes.js` behind
  `requireAuth` + `requireCourseOwnership`.
- `src/controllers/admin.controller.js` — extended with `createLecture` /
  `updateLecture` (both were CP0-earmarked for Checkpoint 6, same pattern
  as Checkpoint 5's liability-summary — real handlers, still gated behind
  the still-stubbed `requireAdmin`, so genuinely unreachable until
  Checkpoint 8) and `reorderLectures` (a **new** route,
  `PUT /admin/courses/:id/lectures/reorder`, not one of CP0's original
  stubs — added because checkpoint.md's own goal text calls for atomic
  bulk reordering, which per-lecture `PATCH` calls can't guarantee; see
  that function's comment for the full reasoning and its strict
  set-equality validation).

---

## User dashboard data APIs (Checkpoint 7 — implemented)

All read-heavy sidebar endpoints, mounted in `user.routes.js`. Split
across two controllers by concern:

- `src/controllers/dashboard.controller.js` — `GET /user/dashboard`
  (owned courses, revenue today/7d/30d/all-time, a zero-filled 30-day
  revenue chart, and a searchable "recent referrals" list scoped to
  `reward_type = 'direct'`), `GET /user/affiliate-links` (pure
  computation — no storage — from the user's own refer code + owned
  courses), `GET /user/upgrade` (active, unowned courses),
  `GET /user/leaderboard` (top 10 per window; COMPANY always excluded),
  and `GET /user/my-courses`.
- `src/controllers/profile.controller.js` — `GET`/`PATCH /user/profile`
  (name/email/phone/state, with the sponsor's name + refer code joined
  in), `POST`/`GET /user/profile/photo` (upload + protected serving —
  see below), `POST /user/profile/password`.
- `src/models/rewardTransaction.model.js` — extended with the READ side:
  `getRevenueSummary`, `getRevenueChartData`, `getRecentReferrals`,
  `getLeaderboard`. All built directly off the `reward_transactions`
  ledger, no separate reporting table.
- `src/models/course.model.js` — extended with
  `findOwnedCoursesByUserId` (no `is_active` filter — ownership persists)
  and `findUnownedActiveCoursesForUser` (filtered, for Upgrade).
- `src/models/user.model.js` — extended with `findProfileById` (sponsor
  LEFT JOIN), `updateProfile`, `updateProfilePhotoPath`,
  `findPasswordHashById`.

**Photo upload** (`src/middleware/photoUpload.middleware.js`,
`multer@2.x`): disk storage under `uploads/profile-photos/`, server-
generated filenames only (never the client's original filename), JPEG/
PNG/WEBP only, 5MB cap. `GET /user/profile/photo` always serves the
CALLER's own photo (no `:id` — safe by construction) by reading the file
in an authenticated route handler and streaming it, never via
`express.static` — the "protected route pattern" `app.js` has been
pointing at since Checkpoint 0. The previous photo file is deleted after
a successful re-upload so the directory doesn't accumulate orphans.

**Two things worth knowing about, both flagged in checkpoint.md:**
- `GET /user/my-courses` was tagged for Checkpoint 6 in the original
  route stub, but Checkpoint 6's actual written scope never included it —
  a genuine miss, backfilled here since it needs the same query the
  dashboard does anyway.
- `POST /user/profile/password` isn't in checkpoint.md's own Checkpoint 7
  bullet list, but spec1.md's Profile page explicitly calls for
  "Security: password update" — added since it's clearly in scope and
  cheap to build correctly with utilities that already existed.

---

## What's NOT in Checkpoint 0

No DB schema, no real auth logic, no business logic of any kind. Every
route currently returns `501 Not Implemented` with a message pointing at
the checkpoint that will implement it — this is intentional, so hitting any
endpoint right now tells you exactly what's pending rather than a bare 404.

---

## Database schema (Checkpoint 1)

11 tables, created by `migrations/1700000001000_...` through
`migrations/1700000011000_...` (run in that order via `npm run migrate:up`).
Each migration file has a detailed header comment explaining its design
decisions — this section is just the map.

| Table | Purpose |
|---|---|
| `users` | Every real account + the seeded `COMPANY` system account (`is_system_account = true`). Self-referencing `referrer_id` encodes the referral chain. `wallet_balance` is a denormalized running total — see `reward_transactions` below. |
| `admins` | Fully separate from `users` — own auth, own table, seeded via `npm run seed`, no public signup path. |
| `courses` | The 6 fixed courses (name, price, `direct_bonus`, `indirect_bonus`, `company_cut`, per spec1.md's pricing table). |
| `purchases` | One row per purchase **attempt** (`pending`/`success`/`failed`). Course ownership is *derived* from successful rows here — there's no separate ownership table. A unique partial index blocks a user from successfully buying the same course twice. |
| `reward_transactions` | Audit ledger behind `users.wallet_balance` — one row per wallet credit (`direct`/`indirect`/`company`), linked to the purchase that caused it. Source for dashboard revenue and leaderboard queries later. |
| `withdrawals` | `pending` → `processing` → `paid`/`failed` state machine per spec1.md. |
| `kyc_type_a` | Bank withdrawal KYC. `account_number`, `aadhaar_number`, `pan_number` are stored as `*_encrypted` (AES-256 ciphertext, Checkpoint 4 fills in the actual crypto). Other fields (holder name, IFSC, bank name) are plain. |
| `kyc_type_b` | UPI withdrawal KYC — just `upi_id`, stored plain (not in spec1.md's encrypted-fields list). |
| `fraud_flags` | Append-only, visibility-only per spec1.md — no auto-block, no dismiss workflow. |
| `password_reset_tokens` | Backs Checkpoint 2's forgot-password flow. Stores a hash of the reset token, never the raw token. |
| `lectures` | Course content per spec1.md's "Course Content Delivery" — video **links**, not file uploads. Table exists now; CRUD + ownership-gated access is Checkpoint 6. |

**Money:** every amount column is `numeric(10,2)`, never a float — avoids
floating-point rounding creeping into wallet balances.

**IDs:** plain `serial` (int4) primary keys, not UUIDs — small fixed
schema, easier to eyeball while debugging. Flag in checkpoint.md if a
later checkpoint has a strong reason to want UUIDs instead (e.g. an
affiliate-link URL that shouldn't leak a guessable sequential user id —
worth Checkpoint 7 considering when it builds affiliate links, since
right now the natural implementation is `?ref=<refer_code>`, which is
already non-sequential, so this likely isn't an issue, but noting it).

**Verified locally:** all 11 `up` and `down` migrations were run against a
real local Postgres 16 instance (install/start/migrate/seed/roll-back/
re-migrate, full cycle), not just eyeballed — see Checkpoint 1's Progress
Log entry for what was checked. `npm run seed` was run twice to confirm
idempotency (COMPANY account, all 6 courses, both admins skip cleanly on
re-run rather than erroring or duplicating).

⚠️ **Data note:** BUSINESS PRO's `direct_bonus + indirect_bonus +
company_cut` sums to ₹10,000, not its ₹9,999 price (spec1.md as given) —
seeded exactly as spec1.md states, not "corrected." See checkpoint.md's
open questions.

### Seed scripts (`npm run seed`)

`seeds/run.js` runs three idempotent steps inside one transaction:
1. `seeds/companyAccount.seed.js` — the `COMPANY` system account.
2. `seeds/courses.seed.js` — the 6 fixed courses.
3. `seeds/admins.seed.js` — 2 admin accounts, placeholder credentials
   printed to the console on first creation (`admin1@affiliatecourseplatform.local`
   / `admin2@affiliatecourseplatform.local`, both `ChangeMe123!`) — change
   these before anything resembling a real deployment.

Safe to re-run any time; already-seeded rows are skipped (COMPANY, admins)
or upserted (courses), never duplicated.

---

## Admin auth + panel (Checkpoint 8 — implemented)

**Two-step admin login**, exactly per spec1.md: email+password, then a
6-digit TOTP code, before any admin JWT is issued.

- `src/utils/totp.js` — `speakeasy` + `qrcode` wrapper. `generateSecret`
  returns a base32 secret + `otpauth://` URL; `generateQrCodeDataUrl`
  renders that as a `data:image/png;base64,...` string the frontend can
  drop straight into an `<img src>`; `verifyToken` checks a 6-digit code
  with ±1 time-step tolerance for clock drift.
- `src/utils/adminAuthToken.js` — a fully SEPARATE JWT/cookie mechanism
  from regular users (own secret `ADMIN_JWT_SECRET`, own cookie
  `admin_auth_token`), per the decision `authToken.js` flagged back in
  Checkpoint 2. Issues TWO token types: a short-lived (5 min)
  `admin_pending_2fa_token` right after password verification, and the
  real `admin_auth_token` session only after the TOTP code also
  verifies — step 1 alone can never reach any `/admin/*` route.
- `src/controllers/adminAuth.controller.js` — `login` (detects
  `totp_enabled === false` and returns a QR code instead of just
  prompting for a code — this IS spec1.md's "one-time setup screen," no
  separate endpoint needed), `verifyTwoFactor` (validates the code,
  flips `totp_enabled` to true on first success, issues the session),
  `logout`.
- `src/middleware/admin.middleware.js` — real `requireAdmin`. A regular
  user's token is rejected by construction: different cookie name
  entirely (never even looked at), and even a forged same-named cookie
  would fail signature verification (`ADMIN_JWT_SECRET` ≠ `JWT_SECRET`,
  enforced distinct at boot — see `config/env.js`).
- `src/controllers/admin.controller.js` — extended with course
  create/edit, user list/create/deactivate-or-reactivate (one endpoint,
  `PATCH /admin/users/:id/deactivate`, handles both directions via
  `{ isActive: true|false }` — see that function's comment for why),
  and three visibility endpoints: KYC submissions, withdrawals, referral
  trees (a flat parent-pointer edge list, not a server-nested tree).

**The one place unmasked KYC data is intentional:**
`GET /admin/kyc-submissions` returns FULL, decrypted Aadhaar/PAN/account
numbers — spec1.md's masking rule is explicitly scoped ("masked... except
entry and ADMIN VIEW"), and this endpoint IS that admin view. Verified
live that the exact same underlying data comes back masked via the
user's own `GET /kyc` and fully unmasked via this endpoint, and that a
regular user's session gets a clean 401 attempting to reach it.

`GET /admin/fraud-flags` is now real too — see the "Fraud/abuse baseline
(Checkpoint 9)" section below for the detection logic that populates it.

---

## Fraud/abuse baseline (Checkpoint 9 — implemented)

- **`migrations/1700000012000_add-signup-ip-to-users.js`** — adds an
  indexed `signup_ip` column to `users`. The first schema change since
  Checkpoint 1's original 11 migrations. Nullable — only real self-service
  signups populate it; Checkpoint 8's admin-added users never have a
  request IP to capture.
- **`src/services/fraudDetection.js`** + **`src/models/fraudFlag.model.js`**
  — same-IP signup detection. 3+ signups from one IP within 24 hours
  creates a `fraud_flags` row (`flag_type = 'same_ip_signup'`); a 24-hour
  dedup window stops a burst of signups from the same IP creating a new
  near-duplicate flag on every single one. Both numbers are reasonable
  defaults, not spec-mandated — see that file's header to tune them.
  IP-based only — spec1.md's own Admin Panel wording narrows "same-IP/
  device" down to "same-IP signups" specifically, and no device-
  fingerprinting mechanism exists anywhere else in this stack.
- Wired into `auth.controller.js`'s signup handler as a **best-effort,
  non-blocking** check, run AFTER the account is already committed —
  per spec1.md's explicit "accounts are not auto-blocked," a bug in this
  code path can never fail a legitimate signup. Nothing about a flag is
  ever surfaced to the person signing up, only to admins.
- **`app.set('trust proxy', ...)`** added to `app.js` (production-only)
  — needed for both `req.ip` (fraud detection) and `express-rate-limit`
  to see the real client IP behind Hostinger's reverse-proxy hop, rather
  than the proxy's own IP.
- `GET /admin/fraud-flags` (`admin.controller.js`'s `getFraudFlags`) —
  every flag, newest first, each with its implicated users' id/name/
  refer-code already resolved. No dismiss/resolve action, matching
  Checkpoint 1's deliberate choice not to add a `resolved` column
  (spec1.md asks for visibility only).
- **Rate limiting on login, confirmed** (checkpoint.md's second bullet)
  — `loginLimiter` has covered `POST /auth/login` since Checkpoint 2;
  this checkpoint verified it live (429 after the configured threshold)
  rather than just re-reading the code.

---

## Frontend tooling decision (Checkpoint 10)

No frontend tooling was locked in through Checkpoint 9 — checkpoint.md's
own Global Conventions section left it open. This checkpoint made the
call: **plain HTML/CSS/vanilla JS, no build step, no framework, no
bundler.** Reasoning:

- Matches this project's established lean-dependency ethos (raw `pg`
  over an ORM, no unnecessary packages elsewhere).
- The public pages (landing, course listing/detail, signup, login, 3
  legal pages) are content-forward and mostly non-interactive — a
  handful of `fetch()` calls covers everything needed, nothing here
  justifies a SPA framework's overhead.
- Served from the **same Express process/origin** as the API
  (`express.static()` on a new `public/` directory, wired in `app.js`),
  so every frontend `fetch()` uses a plain relative `/api/v1/...` path —
  no CORS complexity between frontend and backend, one process to deploy
  on the Hostinger VPS.

This is Checkpoint 10's own call, not binding beyond it — Checkpoint 11
(authenticated dashboard: revenue charts, searchable/sortable tables,
live wallet updates) or Checkpoint 12 (admin panel: similar) may
reasonably want more interactivity than vanilla JS comfortably provides,
and should re-evaluate at that point rather than assume this choice
extends automatically. If either does stay vanilla JS for consistency,
that's a fine outcome too — just not an assumption to inherit silently.

**Design system** (`public/assets/css/styles.css`): deep ink-navy
background, muted brass/gold accent, a teal-green reserved for money-
positive states (earnings/success) — a deliberate move away from both
the "neon MLM hype" look common to referral-program sites and the
generic AI-default dark palettes, toward something closer to a fintech/
private-banking register, since spec1.md's "trustworthy" brief matters
a lot here (real bank details and real payouts are involved). Fraunces
(serif display) + IBM Plex Sans (body) + IBM Plex Mono (numbers/refer
codes/data) — a deliberate, non-default type pairing. The landing page's
signature element is an animated SVG "referral chain" diagram (You →
Share → Joins → Earn) in the hero, embodying the product's actual core
mechanic rather than a generic stat-and-gradient hero.

**New backend work needed to support the frontend** (in scope for this
checkpoint, not later checkpoints): `GET /courses` and `GET /courses/:id`
are now real, public endpoints (`src/controllers/course.controller.js`)
— CP0's own stub comment had earmarked these for Checkpoint 10 specifically.
Also added `GET /meta/states` (`src/routes/meta.routes.js`), a small new
resource exposing the same Indian-states list the backend already
validates signups against — `indianStates.js`'s own Checkpoint 2 header
comment anticipated exactly this ("the frontend and this validation both
read from one source of truth"), rather than hand-duplicating the list
into a frontend file where it could drift.

**No redirect after signup/login** — resolved in Checkpoint 11, see below.
signup.js/login.js originally showed an inline "coming soon" message
since the dashboard didn't exist yet.

**Brand name**: spec1.md never names the product. "Coursemint" is a
placeholder invented for this checkpoint's copy — find-and-replace across
the `public/*.html` files if a real name already exists.

---

## Authenticated dashboard frontend — 11a (Checkpoint 11)

**Scope note:** checkpoint.md's own Checkpoint 11 goal text suggested
splitting into 11a (Dashboard, Affiliate Links, My Courses, Upgrade) and
11b (Leaderboard, Wallet, KYC, Profile) given the size, and the project's
own handoff rules call for doing that rather than a rushed partial job.
This checkpoint is **11a only** — Leaderboard/Wallet/KYC/Profile are a
follow-up checkpoint, not built yet.

**Two real bugs found and fixed while building this** (both predate
Checkpoint 11, from before the same-origin frontend/API model existed):
1. `config.frontendUrl` defaulted to `http://localhost:3000` — a stale
   leftover from before Checkpoint 10 made the frontend same-origin with
   the API (which actually runs on `:4000`). Fixed the default in
   `config/env.js`/`.env.example`.
2. `getAffiliateLinks` (`dashboard.controller.js`) built links pointing at
   `/signup`, not `/signup.html` — since there's no clean-URL rewriting
   configured on `express.static`, that link 404'd every time. Fixed to
   `/signup.html`.
Both verified live: generated a real affiliate link over HTTP and
confirmed it actually resolves, not just that it "looks right."

**App shell** (`public/assets/js/app-shell.js`, `public/assets/css/
app.css`): sidebar nav, mobile toggle, logout, and — the actual auth
enforcement mechanism — a `GET /user/profile` call on every authenticated
page load that redirects to `/login.html` on a 401. Static HTML files
have no server-side route guard (`express.static` serves them to anyone);
the REAL protection is that every number on these pages comes from an
independently `requireAuth`-gated API call, so a user who disables JS or
edits the HTML still can't reach real data — this script only controls
what a legitimate session *sees*. `NAV_ITEMS` in that file currently
lists only the 4 pages that exist; Checkpoint 11b must extend it, not
duplicate it, when it adds its 4 pages.

**Pages built:**
- `dashboard.html` — revenue stat cards, a dependency-free CSS/HTML bar
  chart (30 days, no charting library, matching Checkpoint 10's lean-
  dependency decision), owned courses, and a debounced (300ms) searchable
  recent-referrals table.
- `affiliate-links.html` — one card per owned course with a copy-to-
  clipboard button; falls back to selecting the link text if the
  Clipboard API is unavailable (e.g. non-HTTPS in production) rather than
  silently failing.
- `my-courses.html` — owned courses, each with a "View lectures" toggle
  that lazily fetches (and caches) that course's lecture list from
  Checkpoint 6's ownership-gated endpoint on first expand — directly
  fulfilling spec1.md's "video lecture links to be wired in once admin
  adds content" for this specific page.
- `upgrade.html` — unowned courses, wired to the REAL
  `POST /user/purchase` (Checkpoint 3) with no `simulate` field ever sent
  (that's a dev/test-only backend parameter, not something a production
  "Buy" button should expose). A declined purchase shows the actual
  `failureReason` from the API and lets the person retry; a successful
  one refreshes the list and links onward to My Courses / Affiliate Links.

**signup.js/login.js now redirect to `/dashboard.html`** on success,
finally resolving the gap Checkpoint 10 explicitly flagged for this
checkpoint to fix.

---

## Authenticated dashboard frontend — 11b (follow-up)

Completes Checkpoint 11 — the four pages 11a deferred:
`app-shell.js`'s `NAV_ITEMS` now lists all 8 sidebar pages, in spec1.md's
own order.

- **`leaderboard.html`** — the four windows (today/7d/30d/all-time) come
  back in ONE response from `GET /user/leaderboard`; tabs just switch
  which array is rendered client-side, no re-fetch per tab click. Top 3
  ranks get a small visual distinction (`.rank-1`/`.rank-2`/`.rank-3`),
  everything else is plain.
- **`wallet.html`** — balance, a bank/UPI method toggle, and a withdraw
  form. Also fetches `GET /kyc` (read-only) purely for a UX head start —
  showing "complete your KYC first" and disabling submit for whichever
  method isn't set up — but the REAL gating is still 100% server-side
  (`wallet.controller.js`'s existing check); this page's hint is a
  convenience, not a security boundary. No `simulate` field is ever sent,
  same reasoning as `upgrade.js`.
- **`kyc.html`** — both Type A (bank) and Type B (UPI) as separate
  sections, each with a status card (masked values, exactly as
  `GET /kyc` already returns them — this page never sees a full
  Aadhaar/PAN/account number after the moment it's typed into the form)
  above an always-present submit form, since both endpoints upsert —
  resubmission is just submitting again.
- **`profile.html`** — the profile card (name, refer code, join date,
  sponsor — small font, per spec1.md), an editable-details form, photo
  upload, and password change. Photo upload is the ONE place in this
  entire frontend that doesn't go through `api.js`'s JSON-only
  `apiRequest` helper — a file upload needs `FormData`, not a JSON body,
  so it uses a direct `fetch()` with `credentials: 'include'` instead.
  The photo itself is displayed via a plain `<img src="/api/v1/user/
  profile/photo">` — the browser's own request for that URL carries the
  httpOnly auth cookie automatically, and that route is itself
  auth-gated (always the caller's own photo — see
  `profile.controller.js`), so there's no separate credentialed-fetch
  dance needed just to show it.

**Checkpoint 11 is now fully complete** — no outstanding pages remain
in the authenticated user dashboard.

---

## Admin panel frontend — 12a (Checkpoint 12)

**Scope note, same reasoning as Checkpoint 11a:** the admin panel's full
surface (login+2FA, user management, course+lecture management, KYC/
withdrawal/referral-tree visibility, fraud-flag alerts) is comparable in
size to Checkpoint 11's, so this checkpoint is split too. **12a covers
admin login (with 2FA/QR setup) and user management.** Course + lecture
management and the four visibility pages (KYC, withdrawals, referral
trees, fraud flags) are **12b**, not built yet. checkpoint.md's own
"Depends on: Checkpoint 8, 9" for this checkpoint doesn't include
Checkpoint 11 — the admin and user frontends are fully independent apps
hitting separate, unrelated API surfaces, so 11b being outstanding
doesn't block any of this.

**New backend addition needed for the frontend to work at all:**
`GET /admin/me` (`admin.controller.js`'s `getMe`, wired in
`admin.routes.js`) — a minimal "who am I / am I still logged in" probe,
analogous to how `GET /user/profile` already doubled as the regular
user app's session check. Nothing in Checkpoint 8/9 needed this (no
frontend existed yet to call it); adding a purpose-built endpoint here
was the right call over piggybacking the session check on an unrelated,
heavier endpoint like `getLiabilitySummary`.

**`admin-shell.js`** (deliberately a SEPARATE file from the user app's
`app-shell.js`, not shared) — checks the session via `GET /admin/me` and
redirects to `/admin-login.html` (never `/login.html`) on failure. Reuses
`app.css`'s generic sidebar/table/card layout classes rather than
duplicating them into a new stylesheet.

**`admin-login.html`/`admin-login.js`** — the two-step flow as one page,
matching how the backend itself collapses first-time-setup and every-
login-after into the same `verify-2fa` endpoint: password submit reveals
a second form, which shows a QR code (`<img>` fed directly from the
API's `data:image/png;base64,...` response) only when `requiresSetup`
comes back true, then the same 6-digit-code input either completes setup
or just logs in.

**`admin-dashboard.html`** — a small overview: the solvency-guard
liability figure and a total user count, plus a link into user
management (and an honest note that the rest is coming in 12b).

**`admin-users.html`** — a paginated table of every user (20/page, with
Prev/Next), an "Add user" form, and a Deactivate/Reactivate button per
row that calls the same `PATCH .../deactivate` endpoint both directions
via `{ isActive: true|false }`. COMPANY is visibly flagged (`SYSTEM`
badge) and its action column shows nothing, rather than the
deactivate/reactivate button — no code path actually forbids trying it,
but the button just doesn't render for a system account since deactivating
COMPANY has no meaningful product behavior defined anywhere in spec.

---

## Admin panel frontend — 12b (follow-up)

Completes Checkpoint 12 — every remaining item from spec1.md's Admin
Panel section now has a real UI, not just a working API.
`admin-shell.js`'s `ADMIN_NAV_ITEMS` now lists all 7 admin pages.

- **New backend addition needed for this half to work at all:**
  `GET /admin/courses/:id/lectures` (`admin.controller.js`'s
  `getLecturesForCourse`, wired into `admin.routes.js`). The existing
  `GET /courses/:id/lectures` (Checkpoint 6) is gated by course
  *ownership* — no admin account owns any course, so that route was
  structurally unusable for admin management. This is a genuine gap that
  simply never surfaced before, since nothing before this checkpoint
  needed to DISPLAY a course's current lectures before letting an admin
  edit or reorder them.
- **`admin-courses.html`** — every course as an expandable card: an
  inline edit form (name/description/price/all three reward-split
  fields/active toggle) and, once expanded, that course's lecture list
  with up/down reorder buttons and an add-lecture form. Reordering
  submits the full lecture id array to `PUT .../lectures/reorder`
  (Checkpoint 6's endpoint already validates the submitted set matches
  exactly) — deliberately up/down buttons rather than drag-and-drop, a
  simplicity choice that's far more reliably verifiable without a real
  browser/mouse, not a spec requirement either way.
- **`admin-kyc.html`** — full, unmasked Aadhaar/PAN/account-number
  values (spec1.md's explicit admin-view carve-out), but masked-by-
  default in the UI with a per-row "Reveal" toggle — a shoulder-surfing/
  screen-share safety default for a page likely open during a support
  call, not a backend change; the full value is already in memory from
  the initial fetch either way.
- **`admin-withdrawals.html`** — every withdrawal, status-filterable
  (fetched once, filtered client-side).
- **`admin-referral-trees.html`** — the flat parent-pointer edge list
  Checkpoint 8 already returns, rendered as a searchable "User → Referred
  by" table rather than a visual tree/graph widget.
- **`admin-fraud-flags.html`** — card view (variable-length implicated-
  user lists don't fit a fixed-column table well), no dismiss action —
  matches Checkpoint 1's deliberate choice not to add a `resolved` column
  (spec1.md's fraud flags are visibility-only, a permanent record).

**A real, previously-undetected bug was found and fixed while verifying
this checkpoint against live data**: `tests/smokeTest.e2e.test.js`
(Checkpoint 13) does 3 real signups from the same loopback IP across its
two tests, which hits Checkpoint 9's same-IP fraud-detection threshold
exactly — an unnoticed side effect that created a real `fraud_flags` row
every test run, which that file's own cleanup then left dangling
(deleting its users but never knowing to also delete the flag it had
incidentally triggered). Found by actually opening the admin fraud-flags
view against live data and noticing a flag with zero resolved users.
Fixed in `smokeTest.e2e.test.js`'s `after()`: delete any flag overlapping
the test's own created users before deleting those users. Verified fixed
by running the full suite twice against a freshly reset database and
confirming `fraud_flags` is genuinely empty afterward both times (it
wasn't, before the fix).

**Checkpoint 12 is now fully complete** — every admin capability
spec1.md describes has a working frontend, not just a working API.

---

## Integration pass, deploy prep (Checkpoint 13)

**Not new features** — this checkpoint's whole scope is wiring loose
ends across everything built in Checkpoints 0-12, per checkpoint.md's own
framing. Concretely:

- **`tests/smokeTest.e2e.test.js`** (new) — a genuine end-to-end smoke
  test, deliberately different from every other test file in this
  project: it starts the real Express app (`src/app.js`, unmodified) on
  an ephemeral port and drives it with real `fetch()` calls — real
  `Set-Cookie`/`Cookie` round-tripping, real routes, real middleware
  order — rather than calling model/service functions directly the way
  every earlier checkpoint's tests do. Covers the full spec1.md journey:
  signup → referred purchase → reward credited (verified via the
  referrer's real wallet balance, not just a DB row) → KYC submission →
  withdrawal → paid, plus two negative-path checks (withdrawal genuinely
  blocked without KYC, an unauthenticated request genuinely rejected —
  both over real HTTP, not assumed from unit coverage). No new
  dependency — Node's built-in `fetch`, no `supertest`.
- **`docs/DEPLOYMENT.md`** (new) — HTTPS/Certbot setup notes for the
  Hostinger VPS per spec1.md's tech stack section: system prerequisites,
  database setup, `pm2` process management, an nginx reverse-proxy config
  (matching `app.set('trust proxy', 1)`'s "exactly one hop" assumption —
  see `src/app.js`), Certbot, firewall rules, a first-login checklist,
  and ongoing-operations notes. A guide, not deploy automation — no
  scripts were built, matching this checkpoint's "not new features" scope.
- **`docs/PRE_LAUNCH_DECISIONS.md`** (new) — the two open flags from
  spec1.md (refund policy, OTP/email-verification), resurfaced clearly
  with the current behavior, why it's built that way, and what actually
  changing it would require — NOT built here, since both are real
  product decisions and building either speculatively would be wasted
  work if the decision goes the other way. Also collects the CAPTCHA/
  email-provider/admin-password-change gaps already flagged in
  checkpoint.md's standing open items, so nothing gets lost before launch.
- **`docs/SMOKE_TEST_CHECKLIST.md`** (new) — the manual, human-run
  counterpart to the automated test above, for verifying things an
  automated test can't reach (real HTTPS, real browser rendering, a real
  payment/payout gateway once one exists). Explicitly lists what it does
  NOT cover yet (Checkpoint 11b/12b's remaining frontend pages).
- **`.env.example` reviewed** — cross-checked every `process.env.X`
  actually referenced anywhere in `src/`/`seeds/`/`migrations/` against
  this file; every one is present (either active or documented-but-
  commented, like `CAPTCHA_SECRET_KEY`). Fixed an inconsistency: only
  `AES_ENCRYPTION_KEY`/`ADMIN_JWT_SECRET` were labeled "REQUIRED" in
  their section headers, even though `DATABASE_URL`/`JWT_SECRET`/
  `COOKIE_SECRET` are equally hard-required at boot — now all five are
  labeled consistently, plus a new "QUICK REFERENCE" list at the top of
  the file naming all five in one place.
- **Mock→real gateway swap points confirmed clean** — grepped the whole
  codebase to confirm `mockGateway.js` is imported ONLY by its own
  directory's `index.js` in both `src/services/payment/` and
  `src/services/payout/`, and that every actual caller
  (`rewardEngine.js`, `withdrawalEngine.js`, the controllers) goes
  through the `index.js` interface, never the mock directly. The "add a
  new module + flip an env var" swap story that's been documented since
  Checkpoint 3 is verified true, not just asserted.
- **The two spec1.md open flags** — see `docs/PRE_LAUNCH_DECISIONS.md`
  above; not resolved by building anything, since both need your
  decision first.

**Honest scope note, carried forward from Checkpoints 11/12 (update: BOTH
11b and 12b are now done — see their own "(follow-up)" sections above —
this note is left here for the historical record rather than rewritten
silently):**
Checkpoint 11b (Leaderboard/Wallet/KYC/Profile frontend pages) and
Checkpoint 12b (course/lecture management + KYC/withdrawal/referral-tree/
fraud-flag admin visibility pages) were STILL outstanding as of
Checkpoint 13 itself. Checkpoint 13's own five bullet points didn't
actually require either — the smoke test exercises the backend directly
over HTTP, the deploy notes are infrastructure, the env review and
gateway-swap check are backend-only, and the two open flags are policy
decisions — so that checkpoint proceeded without them. **As of the 12b
follow-up, every checkpoint in the original 13-checkpoint plan is
complete** — the full spec1.md feature set (backend, user dashboard, and
admin panel) now has a working, verified frontend, not just a working
API.
