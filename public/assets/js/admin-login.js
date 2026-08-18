/**
 * public/assets/js/admin-login.js
 *
 * Checkpoint 12: the frontend for Checkpoint 8's two-step admin login —
 * `POST /admin/login` (email+password), then `POST /admin/login/
 * verify-2fa` (6-digit TOTP code). Both requests rely on the
 * `admin_pending_2fa_token` cookie the API sets after step 1
 * (`credentials: 'include'` in api.js already sends/receives it) — this
 * page never handles that token directly, same separation of concerns as
 * the backend's own design.
 *
 * `requiresSetup: true` in step 1's response means this admin has never
 * completed TOTP setup — the response also carries `qrCodeDataUrl`
 * (already a full `data:image/png;base64,...` string from Checkpoint 8's
 * `qrcode` usage), which this page drops straight into an `<img src>`.
 * The SAME code input then both completes setup and logs in — no
 * separate "setup" step in the UI, matching how the backend itself
 * collapses first-time-setup and every-time-after into one endpoint.
 */

(function initAdminLoginPage() {
  const passwordForm = document.getElementById('passwordForm');
  const totpForm = document.getElementById('totpForm');
  const qrSetupBlock = document.getElementById('qrSetupBlock');
  const qrCodeImage = document.getElementById('qrCodeImage');
  const totpPrompt = document.getElementById('totpPrompt');
  const formMessage = document.getElementById('formMessage');
  const passwordSubmitBtn = document.getElementById('passwordSubmitBtn');
  const totpSubmitBtn = document.getElementById('totpSubmitBtn');

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage();

    const payload = {
      email: passwordForm.email.value.trim(),
      password: passwordForm.password.value,
    };

    setBusy(passwordSubmitBtn, true, 'Continue', 'Checking\u2026');
    const result = await apiRequest('/admin/login', { method: 'POST', body: payload });
    setBusy(passwordSubmitBtn, false, 'Continue');

    if (!result.ok) {
      showError(apiErrorMessage(result, 'Could not sign in. Please check your email and password.'));
      return;
    }

    passwordForm.style.display = 'none';
    totpForm.style.display = 'block';

    if (result.data.requiresSetup) {
      qrSetupBlock.style.display = 'block';
      qrCodeImage.src = result.data.qrCodeDataUrl;
      totpPrompt.textContent = 'Then enter the 6-digit code it shows to finish setup and sign in.';
    } else {
      qrSetupBlock.style.display = 'none';
      totpPrompt.textContent = 'Enter the 6-digit code from your authenticator app.';
    }

    document.getElementById('totpCode').focus();
  });

  totpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage();

    const code = totpForm.totpCode.value.trim();

    setBusy(totpSubmitBtn, true, 'Verify & sign in', 'Verifying\u2026');
    const result = await apiRequest('/admin/login/verify-2fa', { method: 'POST', body: { code } });
    setBusy(totpSubmitBtn, false, 'Verify & sign in');

    if (!result.ok) {
      showError(apiErrorMessage(result, 'Invalid or expired code. Please try again.'));
      totpForm.totpCode.value = '';
      totpForm.totpCode.focus();
      return;
    }

    showSuccess('Signed in! Redirecting\u2026');
    window.setTimeout(() => { window.location.href = '/admin-dashboard.html'; }, 500);
  });

  function setBusy(button, isBusy, idleText, busyText) {
    button.disabled = isBusy;
    button.textContent = isBusy ? busyText : idleText;
  }

  function showError(message) {
    formMessage.textContent = message;
    formMessage.className = 'form-message is-error';
  }

  function showSuccess(message) {
    formMessage.textContent = message;
    formMessage.className = 'form-message is-success';
  }

  function hideMessage() {
    formMessage.className = 'form-message';
    formMessage.textContent = '';
  }
}());
