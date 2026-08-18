# Affiliate Course Platform — Build Spec

## Overview
A course platform selling 6 fixed courses, with a built-in affiliate/referral rewards program. Users must purchase a course to create an account. Referral rewards flow 2 tiers deep. Built with Node.js + Express + PostgreSQL, dark/professional frontend, mock payment gateway for now.

Reference sites for pre-login UX inspiration: skillinspire.org, skillsbazzar.com

---

## Tech Stack
- **Database:** PostgreSQL
- **Backend:** Node.js + Express
- **Frontend:** Open choice — dark, professional, trustworthy theme with subtle animations (primary audience is 25+)
- **Hosting:** Hostinger VPS
- **File storage:** Local disk on VPS, organized folders, served via protected routes (not public static paths) for anything sensitive (KYC docs, profile photos)
- **Payments:** Mock payment gateway (simulates success/failure, no real gateway integration yet — structure it so a real gateway like Razorpay can be swapped in later without rearchitecting)

All code should be commented throughout so other developers can easily pick up and extend the project.

---

## Courses (fixed set of 6)

| # | Name | Price | Direct Referral Bonus | Indirect Referral Bonus | Company |
|---|------|-------|-------------------|--------------------|---------|
| 1 | SKILLS PRO | ₹699 | ₹510 | ₹40 | ₹149 |
| 2 | EDITING PRO | ₹1499 | ₹1150 | ₹100 | ₹249 |
| 3 | MARKETING PRO | ₹2299 | ₹1800 | ₹150 | ₹349 |
| 4 | CONTENT PRO | ₹4150 | ₹3350 | ₹200 | ₹600 |
| 5 | AI & AUTOMATION PRO | ₹6999 | ₹5400 | ₹300 | ₹1299 |
| 6 | BUSINESS PRO | ₹9999 | ₹7550 | ₹400 | ₹2050 |

Each course has its own description (see original list) and its own reward split — reward amounts are tied to *which course was purchased*, not the buyer's own course.

---

## Affiliate Referral & Reward Logic

- Every user gets a unique refer code on account creation.
- Signup requires a refer code (auto-filled if user arrives via a shared affiliate link; otherwise required as a manual field).
- **Orphan/root referral handling:** seed one special system account, refer code `COMPANY`, in the database at setup. This account is:
  - The default referrer for anyone signing up with an invalid/missing code (in practice, always fill with a valid code — `COMPANY` for direct/no-referrer signups).
  - The automatic recipient of any reward that would otherwise have no valid Indirect Referral Bonus recipient (e.g., if User1 has no sponsor, the "Indirect Referral Bonus" share that would've gone to User1's sponsor when User2 refers someone goes to `COMPANY` instead).
  - This guarantees every reward always resolves to *some* account — no null-referrer edge cases in code.
- **Reward crediting:** instant, at the moment of purchase (credited directly to each recipient's wallet balance).
- **Refunds/reversals: NOT supported at launch** (no refund policy — rewards are final once credited, since there's no reversal mechanism). *Flag: confirm this is acceptable, or a short pre-reward holding window can be added later.*
- Referral chain is **immutable** after signup — a user's referrer never changes.
- The reward on a purchase always follows the course *actually purchased* — its own reward table applies regardless of which course the buyer or their referrer own.
- **Referral tiers are calculated relative to each individual purchase, not fixed per user.** On every purchase, the system walks up exactly two steps from the buyer's own referral chain:
  - **Direct Referral Bonus:** the buyer's *direct* referrer.
  - **Indirect Referral Bonus:** that referrer's own referrer (i.e., two steps up from the buyer).
  - Nobody further up the chain (Tier 3+) receives anything from that purchase — the chain lookup always starts fresh from the buyer, not from any fixed position.

  **Worked example:**
  - User1 signs up, gets a refer code.
  - User2 signs up using User1's code → User2's referrer is User1.
  - User3 signs up using User2's code → User3's referrer is User2 (and User2's referrer is User1).
  - User4 signs up using User3's code → User4's referrer is User3 (and User3's referrer is User2).

  Now trace the rewards:
  - **User3 buys a course:** Direct Referral Bonus → User2 (direct referrer). Indirect Referral Bonus → User1 (User2's referrer). User1 receives the Indirect Referral Bonus here.
  - **User4 buys a course:** Direct Referral Bonus → User3 (direct referrer). Indirect Referral Bonus → User2 (User3's referrer). **User1 receives nothing from this purchase** — relative to User4, User1 is three steps up, past the 2-tier cutoff, even though User1 is at the "top" of the whole chain.

  This confirms referral tiers are *always relative to the buyer making the current purchase*, not a permanent rank assigned to any user.

---

## Fraud & Abuse Prevention (baseline)

- Unique constraint on email and phone number (one account each).
- Self-referral blocked (can't sign up with your own refer code).
- Rate limiting on signup and login endpoints (per IP).
- Simple CAPTCHA on signup and login forms.
- Admin dashboard shows a flag/alert when multiple accounts register from the same IP/device in a short window (visibility only — accounts are not auto-blocked, consistent with the auto-approve model).

---

## Auth

- Passwords hashed with bcrypt.
- JWT stored in an httpOnly cookie.
- Rate-limited auth endpoints (see above).
- "Forgot password" flow via emailed reset link with an expiring token.
- **No OTP/email verification at launch** (deferred — can be added later without much rework; flagged as a known gap for now).

---

## KYC

Two KYC types:
- **Type A (for bank withdrawal):** account holder name, account number, IFSC code, bank name, Aadhaar number, PAN number.
- **Type B (for UPI withdrawal):** UPI ID.

Rules:
- **Auto-approved** on submission (no manual review step).
- Basic format validation still enforced at entry: PAN regex, Aadhaar 12-digit pattern, IFSC regex — reject obviously malformed input even though approval is automatic.
- Aadhaar, PAN, and bank account number are **encrypted at rest** (field-level AES-256, key from environment variable/secret — never hardcoded or logged).
- These fields are **masked in the UI** everywhere except entry and admin view — show only last 4 digits elsewhere.
- Never written to logs (request logs, error logs, etc.).
- All traffic over HTTPS (Let's Encrypt/Certbot on the VPS).

---

## Withdrawals

- **Auto-approved** — no manual admin review step.
- Two withdrawal methods: UPI and Bank Account, each gated behind the respective KYC type being completed.
- Withdrawal history log per user (amount, method, date, status).
- **Payout mechanism:** on auto-approval, the system triggers a payout through a **mock payout gateway** (mirrors the mock purchase gateway — simulates success/failure, no real money moves). Built behind an internal service/interface so it can be swapped for a real payout API (Razorpay Payouts, Cashfree Payouts, etc.) later with no changes to the rest of the withdrawal logic — just point the interface at live credentials once a business account is approved.
  - Withdrawal record moves through simple states: `pending` → `processing` (payout call in flight) → `paid` (confirmed success) or `failed` (error — surfaced to user/admin, retry allowed, and the wallet balance must **not** be deducted if the payout failed).
  - Payout provider credentials/keys (mock or real) stored as environment variables/secrets, same as other sensitive config, so switching providers later is a config change, not a code change.
- **Liability tracking (solvency guard):** admin dashboard shows a running total of **unwithdrawn wallet balance across all users** (sum of every user's current wallet balance). This is money the company owes and must keep in reserve — visible so company funds aren't spent as free-and-clear revenue when a chunk of it is actually pending withdrawal.

---

## Course Content Delivery

- Admin adds lecture **video links** (e.g., unlisted YouTube/Vimeo embed URLs) per course — not file uploads.
- Per course, admin manages a list of lectures: title, video link, order/sequence, optional short description.
- Users only see lecture content for courses they own.

---

## Site Structure

### Public (pre-login) pages
- Landing/marketing pages — take design inspiration from skillinspire.org and skillsbazzar.com.
- Course listing/detail pages (with pricing and description).
- Signup (register) page.
- Login page.
- Placeholder legal pages: Privacy Policy, Terms & Conditions, Refund Policy — **content to be drafted as reasonable placeholder text for now**, clearly marked for replacement by a lawyer before real transactions go live.

### Signup form fields
- Refer code (auto-filled from affiliate link if present, otherwise required — defaults to `COMPANY` if arriving without one)
- Select course (the course being purchased to activate the account)
- Full name
- Phone number
- Email
- State (dropdown — fixed list of Indian states)
- Password
- Confirm password
- Checkbox: "I agree to the Privacy Policy and Terms & Conditions"

### After login — sidebar pages

1. **Dashboard**
   - Name, owned course(s)
   - Revenue: today, last 7 days, last 30 days, all-time
   - Revenue chart
   - Recent referrals list: name, refer ID, package name, amount — with search

2. **Affiliate Links**
   - Shareable links per owned course (opening the link auto-fills the refer code at signup, pre-selected to that course)

3. **My Courses**
   - Cards for owned courses (video lecture links to be wired in once admin adds content)

4. **Upgrade**
   - Cards for unowned courses; purchasing adds the course to My Courses and generates its own affiliate link

5. **Leaderboard**
   - Top earners: today, last 7 days, last 30 days, all-time

6. **Wallet**
   - Balance, withdraw button → choice of UPI or Bank (gated by respective KYC)
   - Withdrawal history

7. **KYC Details**
   - Type A (bank) and Type B (UPI) forms as above, auto-approved on submit

8. **Profile**
   - Profile card: name, email, refer code, registration date, sponsor (name + refer code, small font)
   - Editable details: name, email, phone, state, profile photo
   - Security: password update

---

## Admin Panel (new)

- **Course management:** create/edit courses (name, description, price, reward splits); add/edit/reorder lecture video links per course.
- **User management:** view all users, add users manually, remove/deactivate users.
- **Visibility into:** KYC submissions (auto-approved but viewable), withdrawal history, referral trees, fraud-flag alerts (same-IP signups).
- Admin auth kept separate from user auth (its own role/permission check).

---

## Admin Auth

- Admin accounts are **completely separate from regular user accounts** — no public signup path exists for becoming an admin.
- Stored in their own `admins` table (not the `users` table), since admins don't need KYC, wallet, referral, or course-ownership fields.
- **Two admin accounts at launch, both with identical full permissions** (no tiered/granular roles for now — can be added later if a team grows).
- Both admin accounts are created via a **one-time seed script** (not through any UI), with placeholder email/password values that you can log in with immediately and change later at your convenience.
- Separate login route (e.g. `/admin/login`), separate backend endpoint, separate form from the regular user login.
- Uses the same JWT-in-httpOnly-cookie mechanism as regular users, but every `/admin/*` page and API route is gated by middleware checking the token belongs to the `admins` table (or a `role: 'admin'` check, depending on final schema) — a regular user's valid token is rejected from any admin route.
- **2FA (TOTP-based) required on admin login**, even though regular users skip OTP at launch — admin accounts can view all financial/KYC data and delete users, so the extra step is worth it despite the MVP otherwise staying lean.
  - Implementation: `speakeasy` (or `otplib`) for generating/verifying TOTP codes, `qrcode` for rendering the setup QR — both free npm packages, no third-party service or ongoing cost, fully computed locally.
  - One-time setup screen: generate a secret per admin, store it on the `admins` table, show as a QR code to scan with an authenticator app (Google Authenticator, Authy, etc.).
  - Login flow: email + password, then prompt for the 6-digit TOTP code before issuing the JWT.
  - Recovery: no backup-code system needed at this scale (2 known admins) — if an admin loses access to their authenticator, the secret can be manually reset directly in the database.

---

## Open Flag for Confirmation
- **Refunds are assumed OFF at launch** given instant reward crediting has no reversal path. Confirm this is fine, or we add a short pre-reward hold window.
