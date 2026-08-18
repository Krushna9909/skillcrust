/**
 * public/assets/js/login.js
 *
 * Checkpoint 10: login form wired to Checkpoint 2's
 * `POST /api/v1/auth/login`.
 *
 * *** REDIRECTS TO THE DASHBOARD ON SUCCESS ***
 * Checkpoint 10 flagged this as a known gap ("the authenticated dashboard
 * doesn't exist yet... Checkpoint 11 should replace this with a real
 * redirect once the dashboard exists") — Checkpoint 11 built
 * `/dashboard.html`, so this now redirects there instead of showing an
 * inline "coming soon" message.
 */

(function initLoginPage() {
  const form = document.getElementById('loginForm');
  const formMessage = document.getElementById('formMessage');
  const submitBtn = document.getElementById('submitBtn');

  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage();

    const payload = {
      email: form.email.value.trim(),
      password: form.password.value,
    };

    setSubmitting(true);
    const result = await apiRequest('/auth/login', { method: 'POST', body: payload });
    setSubmitting(false);

    if (!result.ok) {
      var msg = apiErrorMessage(result, 'Could not log in. Please check your email and password.');
      showError(msg);
      if (window.toast) window.toast(msg, 'error');
      return;
    }

    form.reset();
    form.style.display = 'none';
    showSuccess('Logged in! Redirecting to your dashboard\u2026');
    if (window.toast) window.toast('Welcome back \u2014 taking you to your dashboard', 'success');
    window.setTimeout(() => { window.location.href = '/dashboard.html'; }, 600);
  });

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.textContent = isSubmitting ? 'Logging in…' : 'Log in';
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
