/**
 * public/assets/js/admin-users.js
 *
 * admin-users.html only — wired to Checkpoint 8's `GET /admin/users`
 * (paginated), `POST /admin/users` (add manually), and
 * `PATCH /admin/users/:id/deactivate` (toggles BOTH directions via
 * `{ isActive: true|false }` — see admin.controller.js's
 * `setUserActiveStatus` comment for why there's only one route for both).
 */

const PAGE_SIZE = 20;
let currentPage = 1;

document.addEventListener('DOMContentLoaded', async () => {
  const admin = await initAdminShell();
  if (!admin) return;

  await loadUsers(1);
  await loadStateOptions();
  wireAddUserForm();
});

async function loadUsers(page) {
  currentPage = page;
  const wrap = document.getElementById('usersTableWrap');
  const result = await apiRequest(`/admin/users?page=${page}&pageSize=${PAGE_SIZE}`);

  if (!result.ok) {
    wrap.innerHTML = '<div class="alert alert-error" style="margin:22px;">Could not load users. Please refresh the page.</div>';
    return;
  }

  renderUsersTable(result.data.users);
  renderPagination(result.data.pagination);
}

function renderUsersTable(users) {
  const wrap = document.getElementById('usersTableWrap');
  if (!users || users.length === 0) {
    wrap.innerHTML = '<p class="empty-state" style="padding:0 22px 22px;">No users found.</p>';
    return;
  }

  const rows = users.map((u) => `
    <tr>
      <td class="refer-code">${escapeHtml(u.refer_code)}</td>
      <td>${escapeHtml(u.full_name)}${u.is_system_account ? ' <span class="badge" style="margin:0;">SYSTEM</span>' : ''}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.phone)}</td>
      <td class="amount">${formatRupees(u.wallet_balance)}</td>
      <td>${u.is_active ? '<span style="color:var(--money-hover);">Active</span>' : '<span style="color:var(--danger);">Deactivated</span>'}</td>
      <td>
        ${u.is_system_account
          ? '<span style="color:var(--text-faint); font-size:0.82rem;">\u2014</span>'
          : `<button class="btn btn-ghost" type="button" data-toggle-id="${u.id}" data-currently-active="${u.is_active}" style="padding:6px 14px; font-size:0.82rem;">${u.is_active ? 'Deactivate' : 'Reactivate'}</button>`}
      </td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Refer Code</th><th>Name</th><th>Email</th><th>Phone</th><th>Wallet</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-toggle-id]').forEach((btn) => {
    btn.addEventListener('click', () => toggleUserActive(btn));
  });
}

async function toggleUserActive(button) {
  const userId = button.dataset.toggleId;
  const currentlyActive = button.dataset.currentlyActive === 'true';
  const nextState = !currentlyActive;
  const verb = nextState ? 'reactivate' : 'deactivate';

  button.disabled = true;
  button.textContent = nextState ? 'Reactivating\u2026' : 'Deactivating\u2026';

  const result = await apiRequest(`/admin/users/${userId}/deactivate`, {
    method: 'PATCH',
    body: { isActive: nextState },
  });

  if (!result.ok) {
    // eslint-disable-next-line no-alert
    alert(`Could not ${verb} this user: ${apiErrorMessage(result)}`);
    button.disabled = false;
    button.textContent = currentlyActive ? 'Deactivate' : 'Reactivate';
    return;
  }

  await loadUsers(currentPage);
}

function renderPagination(pagination) {
  const controls = document.getElementById('paginationControls');
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));

  controls.innerHTML = `
    <button class="btn btn-ghost" type="button" id="prevPageBtn" style="padding:6px 12px;" ${pagination.page <= 1 ? 'disabled' : ''}>\u2190 Prev</button>
    <span>Page ${pagination.page} of ${totalPages} \u00b7 ${pagination.total} users</span>
    <button class="btn btn-ghost" type="button" id="nextPageBtn" style="padding:6px 12px;" ${pagination.page >= totalPages ? 'disabled' : ''}>Next \u2192</button>
  `;

  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  if (prevBtn) prevBtn.addEventListener('click', () => loadUsers(pagination.page - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => loadUsers(pagination.page + 1));
}

async function loadStateOptions() {
  const select = document.getElementById('newState');
  const result = await apiRequest('/meta/states');
  if (!result.ok) {
    select.innerHTML = '<option value="" disabled selected>Could not load states</option>';
    return;
  }
  select.innerHTML =
    '<option value="" disabled selected>Select a state</option>' +
    result.data.states.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}

function wireAddUserForm() {
  const toggleBtn = document.getElementById('toggleAddFormBtn');
  const cancelBtn = document.getElementById('cancelAddUserBtn');
  const card = document.getElementById('addUserCard');
  const form = document.getElementById('addUserForm');
  const messageEl = document.getElementById('addUserMessage');
  const submitBtn = document.getElementById('addUserSubmitBtn');

  toggleBtn.addEventListener('click', () => {
    card.style.display = card.style.display === 'none' ? 'block' : 'none';
  });
  cancelBtn.addEventListener('click', () => {
    card.style.display = 'none';
    form.reset();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageEl.className = 'form-message';

    const payload = {
      fullName: document.getElementById('newFullName').value.trim(),
      email: document.getElementById('newEmail').value.trim(),
      phone: document.getElementById('newPhone').value.trim(),
      state: document.getElementById('newState').value,
      password: document.getElementById('newPassword').value,
    };
    const referCode = document.getElementById('newReferCode').value.trim();
    if (referCode) payload.referCode = referCode;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating\u2026';
    const result = await apiRequest('/admin/users', { method: 'POST', body: payload });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create user';

    if (!result.ok) {
      messageEl.textContent = apiErrorMessage(result, 'Could not create the user.');
      messageEl.className = 'form-message is-error';
      return;
    }

    form.reset();
    card.style.display = 'none';
    await loadUsers(1);
  });
}
