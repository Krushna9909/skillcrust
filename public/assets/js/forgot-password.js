/**
 * public/assets/js/forgot-password.js
 *
 * Self-service password reset: email + new password + confirm password,
 * posted to `POST /api/v1/auth/reset-password-direct`. On success the user
 * is bounced to the login page.
 */

(function initForgotPasswordPage() {
  const form = document.getElementById('resetForm');
  const formMessage = document.getElementById('formMessage');
  const submitBtn = document.getElementById('submitBtn');

  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage();

    const payload = {
      email: form.email.value.trim(),
      newPassword: form.newPassword.value,
      confirmNewPassword: form.confirmNewPassword.value,
    };

    if (payload.newPassword !== payload.confirmNewPassword) {
      showError('New password and confirm password do not match.');
      return;
    }

    setSubmitting(true);
    const result = await apiRequest('/auth/reset-password-direct', { method: 'POST', body: payload });
    setSubmitting(false);

    if (!result.ok) {
      const msg = apiErrorMessage(result, 'Could not reset your password. Please check your details.');
      showError(msg);
      if (window.toast) window.toast(msg, 'error');
      return;
    }

    form.reset();
    form.style.display = 'none';
    showSuccess('Password reset! Redirecting you to log in\u2026');
    if (window.toast) window.toast('Password updated \u2014 log in with your new password', 'success');
    window.setTimeout(() => { window.location.href = '/login.html'; }, 900);
  });

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.textContent = isSubmitting ? 'Resetting…' : 'Reset password';
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
