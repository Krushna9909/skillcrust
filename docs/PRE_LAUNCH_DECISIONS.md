# Pre-Launch Decisions Needed

Checkpoint 13: "Resolve the two open flags from spec1.md: refund policy
decision, OTP/email-verification gap." **Resolving** these means bringing
them back to you clearly, one final time, with the current state and the
tradeoffs spelled out — NOT building new features for either. Checkpoint
13's own scope is explicitly "wire loose ends, not new features," and
both of these are real product decisions only you can make; building a
refund system or an OTP-verification flow on spec on the assumption of
which way you'll decide would be presumptuous and wasted work if you
decide the other way.

---

## 1. Refund policy

**Current behavior:** no refunds, at all, ever. Once a purchase succeeds,
it's permanent — reflected in `public/refund.html`'s placeholder copy,
`src/services/rewardEngine.js` (which has no reversal path at all — by
design, not by omission), and the database schema itself (Checkpoint 1
deliberately didn't build any mechanism to claw back an already-credited
`reward_transactions` row).

**Why it's built this way:** spec1.md is explicit that this was already
the assumed default — "Refunds/reversals: NOT supported at launch...
rewards are final once credited, since there's no reversal mechanism" —
and separately flags it as needing your confirmation: "Refunds are
assumed OFF at launch... Confirm this is fine, or we add a short
pre-reward hold window." Every checkpoint since Checkpoint 1 built on
top of that assumption holding.

**What changing this would actually require**, if you want a refund
window instead of "never": this is NOT a small change — it would touch
several already-shipped, already-tested pieces:
- A new `pending` → `refund-eligible` window before rewards are credited
  (currently, `rewardEngine.js` credits instantly, in the same request as
  the purchase — see that file's header comment for why that's the
  current design). Introducing a delay changes the reward engine's core
  shape, not just a policy flag.
- A refund endpoint + a decision about what happens to ALREADY-credited
  referral rewards if a refund happens after the hold window (claw them
  back from the referrer's wallet? Leave them, accepting the company eats
  the loss? Neither is free of edge cases — e.g. what if the referrer
  already withdrew that money?).
- Updated legal copy (`public/refund.html`) and updated `Terms &
  Conditions` language about the referral program's finality.

**Decision needed:** confirm "no refunds, ever" is fine as the real
launch policy — or, if not, this is worth scoping as its own follow-up
checkpoint (not a quick tweak) given the above.

---

## 2. OTP / email verification gap

**Current behavior:** none. A regular user's email and phone number are
validated for FORMAT only (a real-looking email address, a real-looking
10-digit Indian mobile number) — never verified as actually belonging to
that person. Anyone can sign up with an email or phone number they don't
own or control.

**Why it's built this way:** spec1.md states this directly — "No OTP/
email verification at launch (deferred — can be added later without much
rework; flagged as a known gap for now)." Every checkpoint since
Checkpoint 2 built the signup/login flow on top of that assumption.

**What adding this would actually require**, if you want it before
launch: spec1.md's own claim that it can be "added later without much
rework" holds up reasonably well against how the codebase actually
turned out — a few concrete additions would cover it:
- A `users.email_verified` / `users.phone_verified` column (or a single
  combined flag, depending on how strict you want to be) — a new,
  small migration, following the same pattern as Checkpoint 9's
  `signup_ip` addition.
- An OTP-send step (SMS for phone, or reusing the same transactional-
  email decision from the standing open items below for email) plus an
  OTP-verify endpoint.
- A decision about WHEN verification is required: block signup entirely
  until verified (a bigger UX change, since account creation currently
  happens in one step alongside the course purchase), or let a user sign
  up and use the account immediately but require verification before
  certain actions (e.g. before their first withdrawal, similar to how
  KYC already gates withdrawals) — the second is a smaller, more
  surgical change that reuses a pattern already proven in this codebase.

**Decision needed:** confirm the current no-verification state is
acceptable for launch — or, if not, which of the two enforcement points
above (block signup vs. gate later actions) you'd prefer, so a follow-up
checkpoint can scope it precisely instead of guessing.

---

## Related standing open items

(From `checkpoint.md`, not spec1.md's own two named flags above, but
worth resolving alongside them.)

- **CAPTCHA provider** — currently a stub (`src/middleware/
  captcha.middleware.js`); passes every request through with a one-time
  console warning until `CAPTCHA_SECRET_KEY` is set, at which point it
  fails loudly (501) rather than pretending to verify. Needs an actual
  provider choice (hCaptcha / reCAPTCHA / Turnstile) before launch.
- **Transactional email provider** — currently a stub (`src/utils/
  mailer.js`); logs to the console outside production, throws in
  production rather than silently dropping an email. The forgot-password
  flow is non-functional in a real deployment until a real provider is
  wired in.
- **Admin "change my own password" flow** — doesn't exist yet (see
  `docs/DEPLOYMENT.md`'s first-login checklist); the two seeded admin
  passwords currently need a direct database update to change.

None of these three are new — they're carried forward from earlier
checkpoints' own flagged gaps — but they're exactly the kind of thing a
final "wire loose ends" pass should make sure doesn't get lost before a
real launch, so they're collected here alongside the two spec1.md names
explicitly.
