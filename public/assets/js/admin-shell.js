/**
 * public/assets/js/admin-shell.js
 *
 * Checkpoint 12's admin-side equivalent of the user app's
 * `app-shell.js` (Checkpoint 11a) — same pattern, deliberately NOT the
 * same file. Admin sessions use a completely separate cookie/secret
 * (`admin_auth_token`, `ADMIN_JWT_SECRET` — see
 * src/utils/adminAuthToken.js's Checkpoint 8 header comment for why),
 * so the admin frontend's session check calls `GET /admin/me`
 * (Checkpoint 12, new) instead of `GET /user/profile`, and a failed
 * check redirects to `/admin-login.html`, never `/login.html` — an
 * admin session and a user session must never be conflated on either
 * side of this app.
 *
 * Reuses `app.css`'s sidebar/topbar/table/card classes (`.app-shell`,
 * `.app-sidebar`, `.app-nav`, `.table-card`, etc.) — those are generic
 * layout primitives, not user-app-specific, so there's no reason to
 * duplicate them into a separate admin.css file.
 */

const ADMIN_NAV_ITEMS = [
  { href: '/admin-dashboard.html', label: 'Overview', icon: '\u25C6' },
  { href: '/admin-users.html', label: 'Users', icon: '\u25A4' },
  { href: '/admin-courses.html', label: 'Courses', icon: '\u2637' },
  { href: '/admin-kyc.html', label: 'KYC Submissions', icon: '\u2713' },
  { href: '/admin-withdrawals.html', label: 'Withdrawals', icon: '\u20B9' },
  { href: '/admin-referral-trees.html', label: 'Referral Trees', icon: '\u26D3' },
  { href: '/admin-fraud-flags.html', label: 'Fraud Flags', icon: '\u26A0' },
];

/**
 * Same contract as the user app's `initAppShell()`: renders the sidebar
 * chrome into `#appShellRoot`, checks the session via `GET /admin/me`,
 * and returns the admin `{ id, email }` — or null (with a redirect
 * already underway) if the session check failed.
 */
async function initAdminShell() {
  renderAdminShellChrome();
  wireAdminShellInteractions();

  const result = await apiRequest('/admin/me');
  if (!result.ok) {
    window.location.href = '/admin-login.html';
    return null;
  }

  const admin = result.data.admin;
  const userEl = document.getElementById('sidebarUser');
  if (userEl) userEl.querySelector('strong').textContent = admin.email;
  return admin;
}

function renderAdminShellChrome() {
  const root = document.getElementById('appShellRoot');
  if (!root) return;

  const currentPath = window.location.pathname;
  const navHtml = ADMIN_NAV_ITEMS.map((item) => {
    const isActive = currentPath === item.href;
    return `<li><a href="${item.href}"${isActive ? ' class="is-active" aria-current="page"' : ''}><span class="icon">${item.icon}</span> ${item.label}</a></li>`;
  }).join('');

  root.insertAdjacentHTML('afterbegin', `
    <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
    <aside class="app-sidebar" id="appSidebar">
      <a href="/admin-dashboard.html" class="brand">${window.logoMarkSvg()}<span class="brand-text">Skill<span>Crust</span> <span class="brand-sub">ADMIN</span></span></a>
      <ul class="app-nav">${navHtml}</ul>
      <div class="app-sidebar-footer">
        <div class="sidebar-user" id="sidebarUser">
          <strong>&hellip;</strong>
        </div>
        <button class="btn btn-ghost btn-block" id="logoutBtn" type="button">Log out</button>
      </div>
    </aside>
    <div class="app-topbar">
      <button class="app-topbar-toggle" id="topbarToggle" aria-label="Open menu" aria-expanded="false">\u2630 Menu</button>
      <span class="brand" style="font-size:1.05rem;">${window.logoMarkSvg()}Skill<span>Crust</span> Admin</span>
      <div class="app-topbar-actions" data-theme-slot></div>
    </div>
  `);

  // theme.js fills [data-theme-slot] on DOMContentLoaded, which has already
  // fired by the time this chrome is injected, so fill it manually.
  const slot = root.querySelector('.app-topbar-actions[data-theme-slot]');
  if (slot && typeof window.themeToggleMarkup === 'function') {
    slot.insertAdjacentHTML('beforeend', window.themeToggleMarkup());
  }
}

function wireAdminShellInteractions() {
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const toggle = document.getElementById('topbarToggle');
  const logoutBtn = document.getElementById('logoutBtn');

  function closeSidebar() {
    sidebar.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
  function openSidebar() {
    sidebar.classList.add('is-open');
    backdrop.classList.add('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
  }

  if (toggle) {
    toggle.addEventListener('click', () => {
      if (sidebar.classList.contains('is-open')) closeSidebar(); else openSidebar();
    });
  }
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      logoutBtn.disabled = true;
      await apiRequest('/admin/logout', { method: 'POST' });
      window.location.href = '/admin-login.html';
    });
  }
}

function formatRupees(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '\u20B9\u2014';
  return '\u20B9' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
