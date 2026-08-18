# Smoke-Test Checklist

Checkpoint 13's other smoke-test deliverable — this is the **manual**,
human-run checklist, for verifying an actual deployment (real domain,
real HTTPS, real browser, eventually a real payment/payout gateway) in
ways an automated test can't reach. The **automated** version of this
same journey is `tests/smokeTest.e2e.test.js` (real HTTP against the
real Express app, run via `npm test`) — run that first, since anything
failing there will fail here too, faster to diagnose.

Run this after every deploy to a new environment, and after any change
to the auth, payment, or withdrawal code paths.

## 1. Public site

- [ ] Landing page (`/`) loads over HTTPS with a valid certificate (no
      browser warning).
- [ ] Course listing (`/courses.html`) shows all 6 active courses with
      correct prices.
- [ ] A course detail page (`/course-detail.html?id=1`) loads and its
      "Buy & create account" button links to `/signup.html?courseId=1`.
- [ ] Privacy/Terms/Refund pages load and are clearly marked as
      placeholders (see `docs/PRE_LAUNCH_DECISIONS.md` before removing
      that marking).

## 2. Signup → purchase → reward

- [ ] Sign up a real test account with no refer code — confirm it lands
      on `/dashboard.html` and the account was created (check
      `SELECT refer_code FROM users WHERE email = '...'` if needed).
- [ ] Copy that account's affiliate link from `/affiliate-links.html` —
      confirm the link's origin matches your real domain (not
      `localhost`) and that opening it in an incognito window correctly
      pre-fills the refer code and course on the signup form.
- [ ] Sign up a SECOND test account through that link — confirm the
      first account's wallet balance increases by exactly that course's
      direct-bonus amount (`/dashboard.html`'s stat cards, or
      `GET /api/v1/user/dashboard`).
- [ ] Confirm the second account's signup shows up in the first
      account's "Recent referrals" list, and that the dashboard's search
      box actually filters it.

## 3. My Courses / Upgrade

- [ ] `/my-courses.html` shows the purchased course; if any lectures
      have been added via the admin panel, confirm "View lectures" shows
      them and each video link actually opens.
- [ ] `/upgrade.html` shows every course NOT yet owned; buy one and
      confirm it moves to My Courses and a new affiliate link appears
      for it.

## 4. KYC → Wallet → Withdrawal

- [ ] Submit Type A (bank) KYC with realistic-but-fake test data — 12345
      style fake data is fine; the point is proving the encryption round-
      trips through your live database, not testing an approval workflow
      (it's auto-approved either way).
- [ ] Confirm `GET /api/v1/kyc` shows Aadhaar/PAN/account number masked
      to last-4 only.
- [ ] Request a withdrawal for less than the wallet balance — confirm it
      succeeds (mock gateway, so this should always succeed unless
      `MOCK_PAYMENT_FAILURE_RATE`/`MOCK_PAYOUT_FAILURE_RATE` is
      non-zero in this environment's `.env` — it should be `0` in
      production) and the wallet balance drops by exactly that amount.
- [ ] Confirm the withdrawal appears in withdrawal history with status
      `paid`.
- [ ] **Once a real payout provider is wired in** (still `mock` as of
      this checkpoint — see `docs/PRE_LAUNCH_DECISIONS.md`'s standing
      items and `README.md`'s "Mock payment / payout gateway pattern"):
      re-run this step and confirm real money actually moves, on a small
      real test amount, before trusting it at scale.

## 5. Admin panel

- [ ] Log into `/admin-login.html` with each seeded admin account —
      confirm you changed both placeholder passwords already (see
      `docs/DEPLOYMENT.md` section 7) and completed real TOTP setup.
- [ ] `/admin-dashboard.html` shows a liability figure and user count
      that look plausible against what you just did in sections 2-4
      above.
- [ ] `/admin-users.html` shows the test accounts you created; deactivate
      one and confirm that account genuinely can't log in anymore, then
      reactivate it.
- [ ] Confirm a REGULAR user's session (from section 2) gets a clean 401
      on any `/api/v1/admin/*` route — this is the single most important
      security check in this whole checklist.

## 6. What this checklist does NOT cover yet

- Checkpoint 11b's remaining pages (Leaderboard, Wallet, KYC, Profile —
  the backend for all four exists and is covered by section 4 above via
  direct API calls, but there's no frontend page for any of them yet).
- Checkpoint 12b's remaining admin pages (course/lecture management, KYC/
  withdrawal/referral-tree/fraud-flag visibility — same story, backend
  exists, no frontend yet).
- A real payment/payout gateway (still `mock` — see section 4's last
  item).
- Anything from `docs/PRE_LAUNCH_DECISIONS.md` that you haven't decided
  on yet.

Test what you can with the pieces that exist; don't sign off on "the
whole app works" based on this checklist alone until the gaps above are
closed.
