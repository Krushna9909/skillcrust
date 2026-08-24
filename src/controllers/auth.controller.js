/**
 * src/controllers/auth.controller.js
 *
 * Checkpoint 2: signup, login, logout, forgot-password, reset-password.
 * Checkpoint 3 wires the reward engine into signup's purchase (see below).
 * Checkpoint 9 adds same-IP signup fraud detection (also see below) —
 * everything else in this file is unchanged since Checkpoint 2/3.
 *
 * *** SIGNUP + "must purchase a course" — key design decision ***
 * spec1.md says "Users must purchase a course to create an account." This
 * signup handler creates the user account (with its referral chain
 * recorded) AND a `purchases` row for the selected course with
 * `status = 'pending'`, in ONE DB transaction — then, as of Checkpoint 3,
 * IMMEDIATELY resolves that pending purchase via
 * `src/services/rewardEngine.js` in a SEPARATE step, after that
 * transaction has already committed and its client released.
 *
 * Two transactions, not one, and deliberately so: the account-creation
 * transaction commits regardless of whether the subsequent payment
 * attempt succeeds — exactly like a real gateway integration would have
 * to work (you cannot hold a DB transaction open across a slow external
 * network call, and you cannot roll back a charge that's already been
 * sent to a real gateway). This means a failed signup-time payment leaves
 * a real, logged-in account that owns no courses yet — the person can
 * retry via `POST /user/purchase` (Checkpoint 3's other new endpoint).
 * See `src/services/rewardEngine.js`'s file header for the full reasoning
 * behind this two-phase shape; this handler is just one of its two
 * callers (the other is `src/controllers/purchase.controller.js`).
 *
 * *** Self-referral block — how it's actually enforced ***
 * spec1.md: "Self-referral blocked (can't sign up with your own refer
 * code)." Refer codes are randomly server-generated (utils/referCode.js),
 * never user-chosen, and only generated AFTER a submitted refer_code has
 * already been resolved to an EXISTING different user (or defaulted to
 * COMPANY). That ordering makes literal self-referral structurally
 * impossible at signup: the code a user submits must already exist in the
 * DB to resolve to a referrer, while the code this signup will receive is
 * guaranteed (by the uniqueness check in generateUniqueReferCode) not to
 * already exist. The explicit comparison below is therefore a documented,
 * always-false assertion kept as defense-in-depth, backed by Checkpoint
 * 1's DB-level `users_no_self_referral` CHECK constraint as the final
 * backstop. The realistic version of "one person, multiple accounts,
 * crediting themselves via referrals" isn't something a refer_code check
 * can catch at all — that's what Checkpoint 9's fraud-flag detection
 * (same-IP signups) is for.
 */

const crypto = require('crypto');
const ms = require('ms');

const { pool } = require('../config/db');
const { createHttpError } = require('../utils/httpError');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateUniqueReferCode } = require('../utils/referCode');
const { setAuthCookie, clearAuthCookie } = require('../utils/authToken');
const { sendMail } = require('../utils/mailer');
const { COMPANY_REFER_CODE } = require('../utils/constants');
const paymentGateway = require('../services/payment');
const rewardEngine = require('../services/rewardEngine');
const fraudDetection = require('../services/fraudDetection');
const config = require('../config/env');
const {
  validateEmail,
  validatePhone,
  validatePassword,
  validateFullName,
  validateState,
  validateReferCode,
} = require('../utils/validators');

const userModel = require('../models/user.model');
const courseModel = require('../models/course.model');
const purchaseModel = require('../models/purchase.model');
const resetTokenModel = require('../models/passwordResetToken.model');

const PASSWORD_RESET_TOKEN_TTL = '1h';

// --- signup ------------------------------------------------------------

async function signup(req, res, next) {
  const body = req.body || {};

  // --- Validation (collect every error, not just the first) ----------
  const errors = [];

  const nameErr = validateFullName(body.fullName);
  if (nameErr) errors.push(nameErr);

  const emailErr = validateEmail(body.email);
  if (emailErr) errors.push(emailErr);

  const phoneResult = validatePhone(body.phone);
  if (phoneResult.error) errors.push(phoneResult.error);

  const stateErr = validateState(body.state);
  if (stateErr) errors.push(stateErr);

  const passwordErr = validatePassword(body.password);
  if (passwordErr) errors.push(passwordErr);

  if (body.password !== body.confirmPassword) {
    errors.push('Password and confirm password do not match.');
  }

  if (body.agreeToTerms !== true) {
    errors.push('You must agree to the Privacy Policy and Terms & Conditions.');
  }

  const referCodeErr = validateReferCode(body.referCode);
  if (referCodeErr) errors.push(referCodeErr);

  const courseId = Number(body.courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    errors.push('A valid course selection is required.');
  }

  if (errors.length > 0) {
    return next(createHttpError(400, errors.join(' ')));
  }

  const email = body.email.trim().toLowerCase();
  const phone = phoneResult.normalized;
  const fullName = body.fullName.trim();
  const submittedReferCode = body.referCode ? body.referCode.trim().toUpperCase() : null;

  const client = await pool.connect();
  let committed = false;
  let released = false;
  try {
    await client.query('BEGIN');

    // --- Resolve referrer (defaults to COMPANY on missing/invalid code,
    // per spec1.md's "Orphan/root referral handling") -------------------
    let referrer = null;
    let referralFallbackApplied = false;

    if (submittedReferCode) {
      referrer = await userModel.findByReferCode(client, submittedReferCode);
    }
    if (!referrer) {
      referralFallbackApplied = Boolean(submittedReferCode); // true only if an invalid code was given
      referrer = await userModel.findByReferCode(client, COMPANY_REFER_CODE);
      if (!referrer) {
        // Should be impossible post-Checkpoint-1 seed, but fail loudly
        // rather than silently proceeding with no referrer at all.
        throw createHttpError(
          500,
          'COMPANY system account is missing — run `npm run seed` before accepting signups.'
        );
      }
    }

    // --- Validate course selection --------------------------------------
    const course = await courseModel.findActiveCourseById(client, courseId);
    if (!course) {
      throw createHttpError(400, 'Selected course does not exist or is not currently available.');
    }

    // --- Uniqueness pre-checks (friendlier errors; DB constraints are
    // still the final backstop against a race condition) -----------------
    if (await userModel.findByEmail(client, email)) {
      throw createHttpError(409, 'An account with this email already exists.');
    }
    if (await userModel.findByPhone(client, phone)) {
      throw createHttpError(409, 'An account with this phone number already exists.');
    }

    // --- Generate this user's own refer code -----------------------------
    const newReferCode = await generateUniqueReferCode(client);

    // Self-referral guard — see file header for why this can only ever be
    // false in practice; kept as an explicit, documented assertion rather
    // than silently relying on that being true.
    if (submittedReferCode && submittedReferCode === newReferCode) {
      throw createHttpError(400, 'You cannot refer yourself.');
    }

    const passwordHash = await hashPassword(body.password);

    const user = await userModel.createUser(client, {
      referCode: newReferCode,
      referrerId: referrer.id,
      fullName,
      email,
      phone,
      passwordHash,
      state: body.state,
      signupIp: req.ip,
    });

    const purchase = await purchaseModel.createPendingPurchase(client, {
      buyerId: user.id,
      courseId: course.id,
      amount: course.price,
    });

    await client.query('COMMIT');
    committed = true;
    client.release();
    released = true;

    // --- Checkpoint 3: resolve the signup-time purchase ------------------
    // Deliberately AFTER the transaction above has committed and its
    // client released — see this file's header and rewardEngine.js's for
    // why payment processing can't share a transaction with account
    // creation. The account exists and the person is logged in either way.
    const simulate = paymentGateway.sanitizeSimulateOverride(req.body.simulate);
    let purchaseOutcome;
    try {
      purchaseOutcome = await rewardEngine.processPendingPurchase(purchase.id, { simulate });
    } catch (engineErr) {
      // Extremely unlikely (see rewardEngine.js's own error cases — this
      // purchase was just created above, so "already resolved" and
      // "COMPANY missing" are the only realistic causes, and neither
      // should happen in a correctly-seeded, single-request flow). The
      // account itself already committed successfully, so this does NOT
      // become a generic 500 that hides that — log it for operator
      // visibility and tell the client to retry via POST /user/purchase
      // instead of silently leaving the purchase looking 'pending' forever.
      // eslint-disable-next-line no-console
      console.error('[signup] reward engine threw while resolving the signup purchase:', engineErr);
      purchaseOutcome = {
        id: purchase.id,
        status: 'error',
        courseId: purchase.course_id,
        amount: purchase.amount,
        failureReason: 'Payment processing hit an unexpected error. Retry via POST /user/purchase.',
      };
    }

    setAuthCookie(res, user);

    // --- Checkpoint 9: same-IP signup fraud detection ---------------------
    // Best-effort, fire-and-forget in the sense that it can NEVER fail this
    // response — visibility-only per spec1.md ("accounts are not auto-
    // blocked"), so a bug here should never block a legitimate signup.
    // Deliberately not awaited-into-the-response — nothing about this
    // check is surfaced to the person signing up, only to admins (see
    // src/services/fraudDetection.js's file header for the full reasoning).
    try {
      await fraudDetection.checkAndFlagSameIpSignups(req.ip);
    } catch (fraudErr) {
      // eslint-disable-next-line no-console
      console.error('[signup] fraud detection check failed (non-fatal):', fraudErr.message);
    }

    return res.status(201).json({
      user,
      referral: {
        referrerReferCode: referrer.refer_code,
        fallbackApplied: referralFallbackApplied,
      },
      purchase: purchaseOutcome,
    });
  } catch (err) {
    if (!committed) {
      await client.query('ROLLBACK');
    }

    // Belt-and-suspenders against the pre-check/insert race window: a
    // unique-constraint violation slipping through despite the checks
    // above still gets a clean 409 instead of a raw 500.
    if (err.code === '23505') {
      const field =
        err.constraint === 'users_email_key' ? 'email' :
        err.constraint === 'users_phone_key' ? 'phone number' :
        err.constraint === 'users_refer_code_key' ? 'refer code' : 'field';
      return next(createHttpError(409, `An account with this ${field} already exists.`));
    }

    return next(err);
  } finally {
    if (!released) {
      client.release();
    }
  }
}

// --- login ---------------------------------------------------------------

async function login(req, res, next) {
  const body = req.body || {};

  const emailErr = validateEmail(body.email);
  if (emailErr) return next(createHttpError(400, emailErr));
  if (!body.password || typeof body.password !== 'string') {
    return next(createHttpError(400, 'Password is required.'));
  }

  const email = body.email.trim().toLowerCase();

  // Single generic message for every failure mode (no account, wrong
  // password, system account, deactivated-but-otherwise-valid-password) —
  // except deactivation, which gets its own message below since the user
  // already knows the account is theirs; nothing else here should hint at
  // *why* a login failed, to avoid account-enumeration.
  const invalidCredentials = () => createHttpError(401, 'Invalid email or password.');

  try {
    const user = await userModel.findByEmail(pool, email);

    if (!user || user.is_system_account) {
      return next(invalidCredentials());
    }

    const passwordMatches = await comparePassword(body.password, user.password_hash);
    if (!passwordMatches) {
      return next(invalidCredentials());
    }

    if (!user.is_active) {
      return next(createHttpError(403, 'This account has been deactivated. Contact support.'));
    }

    const safeUser = await userModel.findSafeById(pool, user.id);
    setAuthCookie(res, safeUser);

    return res.status(200).json({ user: safeUser });
  } catch (err) {
    return next(err);
  }
}

// --- logout ----------------------------------------------------------------

async function logout(req, res) {
  clearAuthCookie(res);
  return res.status(200).json({ message: 'Logged out.' });
}

// --- forgot password ---------------------------------------------------

async function forgotPassword(req, res, next) {
  const body = req.body || {};
  const emailErr = validateEmail(body.email);
  if (emailErr) return next(createHttpError(400, emailErr));

  const email = body.email.trim().toLowerCase();

  // Always return the same generic response whether or not the email is
  // registered — prevents using this endpoint to enumerate accounts.
  const genericResponse = () =>
    res.status(200).json({
      message: 'If that email is registered, a password reset link has been sent.',
    });

  try {
    const user = await userModel.findByEmail(pool, email);
    if (!user || user.is_system_account || !user.is_active) {
      return genericResponse();
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + ms(PASSWORD_RESET_TOKEN_TTL));

    await resetTokenModel.createToken(pool, { userId: user.id, tokenHash, expiresAt });

    const resetLink = `${config.frontendUrl}/reset-password?token=${rawToken}`;
    await sendMail({
      to: email,
      subject: 'Reset your password',
      text:
        `We received a request to reset your password. This link expires in ` +
        `${PASSWORD_RESET_TOKEN_TTL}:\n\n${resetLink}\n\n` +
        'If you did not request this, you can safely ignore this email.',
    });

    return genericResponse();
  } catch (err) {
    return next(err);
  }
}

// --- reset password ------------------------------------------------------

async function resetPassword(req, res, next) {
  const body = req.body || {};

  if (!body.token || typeof body.token !== 'string') {
    return next(createHttpError(400, 'Reset token is required.'));
  }
  const passwordErr = validatePassword(body.newPassword);
  if (passwordErr) return next(createHttpError(400, passwordErr));
  if (body.newPassword !== body.confirmNewPassword) {
    return next(createHttpError(400, 'New password and confirm password do not match.'));
  }

  const tokenHash = crypto.createHash('sha256').update(body.token).digest('hex');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tokenRow = await resetTokenModel.findValidByHash(client, tokenHash);
    if (!tokenRow) {
      throw createHttpError(400, 'This reset link is invalid or has expired.');
    }

    const passwordHash = await hashPassword(body.newPassword);
    await userModel.updatePasswordHash(client, tokenRow.user_id, passwordHash);
    await resetTokenModel.markUsed(client, tokenRow.id);
    await resetTokenModel.invalidateOtherTokensForUser(client, tokenRow.user_id, tokenRow.id);

    await client.query('COMMIT');

    return res.status(200).json({ message: 'Password has been reset. You can now log in.' });
  } catch (err) {
    await client.query('ROLLBACK');
    return next(err);
  } finally {
    client.release();
  }
}

// --- direct password reset (self-service, no email token) -----------------
//
// Powers /forgot-password.html: the user proves the email + sets a new
// password in one step. Rate limited at the route level. Same generic
// error for "no such user" and "inactive/system account" so this cannot be
// used to enumerate registered emails.

async function resetPasswordDirect(req, res, next) {
  const body = req.body || {};

  const emailErr = validateEmail(body.email);
  if (emailErr) return next(createHttpError(400, emailErr));

  const passwordErr = validatePassword(body.newPassword);
  if (passwordErr) return next(createHttpError(400, passwordErr));

  if (body.newPassword !== body.confirmNewPassword) {
    return next(createHttpError(400, 'New password and confirm password do not match.'));
  }

  const email = body.email.trim().toLowerCase();

  try {
    const user = await userModel.findByEmail(pool, email);
    if (!user || user.is_system_account || !user.is_active) {
      return next(createHttpError(400, 'No active account found for that email.'));
    }

    const passwordHash = await hashPassword(body.newPassword);
    await userModel.updatePasswordHash(pool, user.id, passwordHash);

    return res.status(200).json({ message: 'Password has been reset. You can now log in.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { signup, login, logout, forgotPassword, resetPassword, resetPasswordDirect };

