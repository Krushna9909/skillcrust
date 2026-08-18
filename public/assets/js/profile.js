/**
 * public/assets/js/profile.js
 *
 * profile.html only — wired to Checkpoint 7's `GET /user/profile`,
 * `PATCH /user/profile`, `POST /user/profile/photo` (multipart — the
 * only endpoint in this whole frontend that doesn't go through api.js's
 * JSON-only `apiRequest` helper, since a file upload needs `FormData`,
 * not a JSON body), `GET /user/profile/photo` (protected — used here
 * just as an `<img src>`, the browser's own request for that URL
 * carries the auth cookie automatically), and
 * `POST /user/profile/password`.
 */

let currentProfile = null;

document.addEventListener('DOMContentLoaded', async () => {
  const profile = await initAppShell();
  if (!profile) return;

  currentProfile = profile;
  renderProfileHeader(profile);
  populateDetailsForm(profile);
  await loadStateOptions(profile.state);

  wireDetailsForm();
  wirePhotoUpload();
  wirePasswordForm();
});

function renderProfileHeader(profile) {
  document.getElementById('profileNameDisplay').textContent = profile.fullName;
  document.getElementById('profileEmailDisplay').textContent = profile.email;

  const photoEl = document.getElementById('profilePhotoDisplay');
  if (profile.profilePhotoPath) {
    // The browser's own request for this URL carries the httpOnly auth
    // cookie automatically (same-origin <img>, no fetch/credentials
    // handling needed) — GET /user/profile/photo is itself
    // auth+ownership-gated (always the caller's own photo, see
    // profile.controller.js), so this can't leak someone else's photo.
    photoEl.innerHTML = `<img src="/api/v1/user/profile/photo?t=${Date.now()}" alt="Profile photo">`;
  } else {
    photoEl.textContent = profile.fullName.charAt(0).toUpperCase();
  }
}

function populateDetailsForm(profile) {
  document.getElementById('fullName').value = profile.fullName;
  document.getElementById('email').value = profile.email;
  document.getElementById('phone').value = profile.phone;
}

async function loadStateOptions(currentState) {
  const select = document.getElementById('state');
  const result = await apiRequest('/meta/states');
  if (!result.ok) {
    select.innerHTML = '<option value="" disabled selected>Could not load states</option>';
    return;
  }
  select.innerHTML = result.data.states.map((s) =>
    `<option value="${escapeHtml(s)}"${s === currentState ? ' selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');
}

function wireDetailsForm() {
  const form = document.getElementById('detailsForm');
  const submitBtn = document.getElementById('detailsSubmitBtn');
  const messageEl = document.getElementById('detailsMessage');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageEl.className = 'form-message';

    const payload = {
      fullName: document.getElementById('fullName').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      state: document.getElementById('state').value,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving\u2026';
    const result = await apiRequest('/user/profile', { method: 'PATCH', body: payload });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save changes';

    if (!result.ok) {
      messageEl.textContent = apiErrorMessage(result, 'Could not save your details.');
    messageEl.className = 'form-message is-error';
    window.toast(messageEl.textContent, 'error');
      return;
    }

    messageEl.textContent = 'Details updated.';
    messageEl.className = 'form-message is-success';
    window.toast(messageEl.textContent, 'success');
    currentProfile = result.data.profile;
    renderProfileHeader(currentProfile);
  });
}

function wirePhotoUpload() {
  const input = document.getElementById('photoInput');
  const messageEl = document.getElementById('photoMessage');

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;

    messageEl.className = 'form-message';
    const formData = new FormData();
    formData.append('photo', file);

    try {
      const response = await fetch('/api/v1/user/profile/photo', {
        method: 'POST',
        credentials: 'include',
        body: formData, // no Content-Type header — the browser sets the multipart boundary itself
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        messageEl.textContent = (data && data.error && data.error.message) || 'Could not upload photo.';
    messageEl.className = 'form-message is-error';
    window.toast(messageEl.textContent, 'error');
        return;
      }

      currentProfile.profilePhotoPath = data.profilePhotoPath;
      renderProfileHeader(currentProfile);
      messageEl.textContent = 'Photo updated.';
    messageEl.className = 'form-message is-success';
    window.toast(messageEl.textContent, 'success');
    } catch (err) {
      messageEl.textContent = 'Could not upload photo — please try again.';
    messageEl.className = 'form-message is-error';
    window.toast(messageEl.textContent, 'error');
    }
    input.value = '';
  });
}

function wirePasswordForm() {
  const form = document.getElementById('passwordForm');
  const submitBtn = document.getElementById('passwordSubmitBtn');
  const messageEl = document.getElementById('passwordMessage');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageEl.className = 'form-message';

    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    if (newPassword !== confirmNewPassword) {
      messageEl.textContent = 'New password and confirmation do not match.';
    messageEl.className = 'form-message is-error';
    window.toast(messageEl.textContent, 'error');
      return;
    }

    const payload = {
      currentPassword: document.getElementById('currentPassword').value,
      newPassword,
      confirmNewPassword,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating\u2026';
    const result = await apiRequest('/user/profile/password', { method: 'POST', body: payload });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Update password';

    if (!result.ok) {
      messageEl.textContent = apiErrorMessage(result, 'Could not update your password.');
    messageEl.className = 'form-message is-error';
    window.toast(messageEl.textContent, 'error');
      return;
    }

    messageEl.textContent = 'Password updated.';
    messageEl.className = 'form-message is-success';
    window.toast(messageEl.textContent, 'success');
    form.reset();
  });
}
