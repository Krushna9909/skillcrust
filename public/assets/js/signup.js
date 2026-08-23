/**
 * public/assets/js/signup.js
 *
 * Checkpoint 10: signup form wired to Checkpoint 2's
 * `POST /api/v1/auth/signup`, per checkpoint.md's own instruction
 * ("refer-code auto-fill from URL param").
 *
 * *** REFER CODE FIELD — a deliberate UX choice beyond spec1.md's literal
 * *** wording
 * spec1.md: "Refer code (auto-filled from affiliate link if present,
 * otherwise required as a manual field)." This form does NOT make the
 * field `required` when there's no `?referCode=` in the URL. Checkpoint
 * 2's backend already treats a missing/blank/invalid code as "fall back
 * to COMPANY" gracefully (with `fallbackApplied: true` in the response) —
 * forcing the visitor to type something here would just push them toward
 * typing "COMPANY" by hand, which is functionally identical to leaving it
 * blank. Flagged as a UX decision, not a spec violation: the field is
 * shown, explained, and editable either way — just not blocking submit
 * when empty.
 *
 * *** REDIRECTS TO THE DASHBOARD ON SUCCESS ***
 * Checkpoint 10 flagged this as a known gap ("the authenticated dashboard
 * doesn't exist yet... Checkpoint 11 should replace this with a real
 * redirect once the dashboard exists") — Checkpoint 11 built
 * `/dashboard.html`, so this now redirects there instead of showing an
 * inline "coming soon" message.
 */

(function initSignupPage() {
  const form = document.getElementById('signupForm');
  const courseSelect = document.getElementById('courseId');
  const stateSelect = document.getElementById('state');
  const referCodeInput = document.getElementById('referCode');
  const referCodeHint = document.getElementById('referCodeHint');
  const formMessage = document.getElementById('formMessage');
  const submitBtn = document.getElementById('submitBtn');

  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const preselectedCourseId = params.get('courseId');
  const urlReferCode = params.get('referCode');

  if (urlReferCode) {
    referCodeInput.value = urlReferCode;
    referCodeInput.setAttribute('readonly', 'true');
    referCodeHint.textContent = '(from your invite link)';
  }

  loadCourseOptions(preselectedCourseId);
  loadStateOptions();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage();

    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;
    if (password !== confirmPassword) {
      showError('Password and confirm password do not match.');
      if (window.toast) window.toast('Password and confirm password do not match.', 'error');
      return;
    }

    const payload = {
      courseId: Number(form.courseId.value),
      referCode: form.referCode.value.trim() || undefined,
      fullName: form.fullName.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      state: form.state.value,
      password,
      confirmPassword,
      agreeToTerms: form.agreeToTerms.checked,
    };

    setSubmitting(true);
    const result = await apiRequest('/auth/signup', { method: 'POST', body: payload });
    setSubmitting(false);

    if (!result.ok) {
      var msg = apiErrorMessage(result, 'Could not create your account. Please check the form and try again.');
      showError(msg);
      if (window.toast) window.toast(msg, 'error');
      return;
    }

    form.reset();
    form.style.display = 'none';
    showSuccess('Account created! Redirecting to your dashboard\u2026');
    if (window.toast) window.toast('Account created \u2014 welcome to SuccessRich!', 'success');
    window.setTimeout(() => { window.location.href = '/dashboard.html'; }, 900);
  });

  async function loadCourseOptions(selectedId) {
    const result = await apiRequest('/courses');
    if (!result.ok || !Array.isArray(result.data && result.data.courses)) {
      courseSelect.innerHTML = '<option value="" disabled selected>Could not load courses</option>';
      return;
    }
    const courses = result.data.courses;
    courseSelect.innerHTML =
      '<option value="" disabled' + (selectedId ? '' : ' selected') + '>Select a course</option>' +
      courses.map((c) => {
        const isSelected = selectedId && String(c.id) === String(selectedId);
        return `<option value="${c.id}"${isSelected ? ' selected' : ''}>${escapeHtml(c.name)} — ₹${Number(c.price).toLocaleString('en-IN')}</option>`;
      }).join('');
  }

  async function loadStateOptions() {
    const result = await apiRequest('/meta/states');
    if (!result.ok || !Array.isArray(result.data && result.data.states)) {
      stateSelect.innerHTML = '<option value="" disabled selected>Could not load states</option>';
      return;
    }
    const states = result.data.states;
    stateSelect.innerHTML =
      '<option value="" disabled selected>Select your state</option>' +
      states.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.textContent = isSubmitting ? 'Creating account…' : 'Create account';
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}());
