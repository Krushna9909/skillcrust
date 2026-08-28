/**
 * public/assets/js/app-shell.js
 *
 * Loaded on every authenticated page — all 8 sidebar pages spec1.md
 * describes: dashboard, affiliate-links, my-courses, upgrade (Checkpoint
 * 11a) and leaderboard, wallet, kyc, profile (Checkpoint 11b).
 *
 * *** WHY THE SESSION CHECK HAPPENS CLIENT-SIDE, NOT SERVER-SIDE ***
 * These are static HTML files served by `express.static` — the server
 * hands out the HTML to anyone, logged in or not (there's no server-side
 * route guard on a static file the way there is on an API route). The
 * actual protection is: this script calls `GET /user/profile`
 * immediately on load, and if that comes back 401 (Checkpoint 2's
 * `requireAuth`, doing the real enforcement), redirects to `/login.html`
 * before rendering anything meaningful. A user who disables JS or edits
 * the HTML directly still can't get real data — every number on these
 * pages comes from an API call that's independently auth-gated. This
 * script only controls what a legitimate browser session *sees*, not
 * what data is actually reachable.
 *
 * *** SIDEBAR NAV LIST — Checkpoint 11b must extend this ***
 * Only 4 items are listed below (Dashboard, Affiliate Links, My Courses,
 * Upgrade) because those are the only 4 pages that exist so far.
 * Checkpoint 11b (Leaderboard, Wallet, KYC, Profile) needs to add its 4
 * *** SIDEBAR NAV LIST ***
 * Checkpoint 11b (Leaderboard, Wallet, KYC, Profile) completed this list
 * — all 8 sidebar pages spec1.md describes now exist and are listed
 * below, in the same order spec1.md itself lists them.
 */

const NAV_ITEMS = [
  { href: '/dashboard.html', label: 'Dashboard', icon: '\u25C6' },
  { href: '/affiliate-links.html', label: 'Affiliate Links', icon: '\u26D3' },
  { href: '/my-courses.html', label: 'My Courses', icon: '\u25A4' },
  { href: '/upgrade.html', label: 'Upgrade', icon: '\u2191' },
  {
    label: 'Report',
    icon: '\u25A6',
    children: [
      { href: '/my-team.html', label: 'My Team' },
      { href: '/wallet-history.html', label: 'Wallet History' },
    ],
  },
  { href: '/leaderboard.html', label: 'Leaderboard', icon: '\u2605' },
  { href: '/wallet.html', label: 'Wallet', icon: '\u20B9' },
  { href: '/kyc.html', label: 'KYC Details', icon: '\u2713' },
  { href: '/profile.html', label: 'Profile', icon: '\u25CF' },
];


/**
 * Call this at the top of every authenticated page's own script, after
 * the DOM is ready. Renders the sidebar/topbar chrome into the page's
 * `#appShellRoot` element, fetches the current profile (auth check +
 * data for the sidebar footer), and returns the profile so the calling
 * page's own script doesn't need a second fetch just to get the user's
 * name/refer code.
 *
 * @returns {Promise<object|null>} the profile object, or null if the
 *   session check failed and a redirect to /login.html is already
 *   underway (callers should stop doing any further work in that case).
 */
async function initAppShell() {
  renderShellChrome();
  wireShellInteractions();

  const result = await apiRequest('/user/profile');
  if (!result.ok) {
    window.location.href = '/login.html';
    return null;
  }

  const profile = result.data.profile;
  populateSidebarFooter(profile);
  return profile;
}

function renderShellChrome() {
  const root = document.getElementById('appShellRoot');
  if (!root) return;

  const currentPath = window.location.pathname;
  const flat = [];
  NAV_ITEMS.forEach((item) => {
    if (item.children) item.children.forEach((c) => flat.push(c));
    else flat.push(item);
  });
  const current = flat.find((item) => item.href === currentPath);
  const navHtml = NAV_ITEMS.map((item) => {
    if (item.children) {
      const groupOpen = item.children.some((c) => c.href === currentPath);
      const subs = item.children.map((c) => {
        const active = currentPath === c.href;
        return `<li><a href="${c.href}"${active ? ' class="is-active" aria-current="page"' : ''}><span class="dot" aria-hidden="true"></span> ${c.label}</a></li>`;
      }).join('');
      return `<li class="nav-group${groupOpen ? ' is-open' : ''}">
        <button type="button" class="nav-group-toggle${groupOpen ? ' is-active' : ''}" aria-expanded="${groupOpen}">
          <span class="icon" aria-hidden="true">${item.icon}</span> ${item.label}
          <span class="chev" aria-hidden="true">\u203A</span>
        </button>
        <ul class="nav-subnav">${subs}</ul>
      </li>`;
    }
    const isActive = currentPath === item.href;
    return `<li><a href="${item.href}"${isActive ? ' class="is-active" aria-current="page"' : ''}><span class="icon" aria-hidden="true">${item.icon}</span> ${item.label}</a></li>`;
  }).join('');


  root.insertAdjacentHTML('afterbegin', `
    <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
    <aside class="app-sidebar" id="appSidebar" aria-label="Dashboard navigation">
      <a href="/dashboard.html" class="brand">${window.logoMarkSvg()}<span class="brand-text">Success<span>Rich</span></span></a>
      <nav aria-label="Sections"><ul class="app-nav">${navHtml}</ul></nav>
      <div class="app-sidebar-footer">
        <div class="sidebar-wallet">
          <span>Wallet balance</span>
          <strong id="sidebarWallet">\u20B9\u2014</strong>
        </div>
        <div class="sidebar-user" id="sidebarUser">
          <span class="avatar" id="sidebarAvatar" aria-hidden="true">\u2022</span>
          <div>
            <strong>&hellip;</strong>
            <small id="sidebarReferCode"></small>
          </div>
        </div>
        <button class="btn btn-ghost btn-block" id="logoutBtn" type="button">Log out</button>
      </div>
    </aside>
    <div class="app-topbar">
      <button class="app-topbar-toggle" id="topbarToggle" aria-label="Open menu" aria-expanded="false" aria-controls="appSidebar"><span class="burger" aria-hidden="true"></span></button>
      <a href="/dashboard.html" class="brand" style="font-size:1.02rem;">${window.logoMarkSvg()}<span class="brand-text">Success<span>Rich</span></span></a>
      <span class="app-topbar-title">${current ? current.label : ''}</span>
      <div class="app-topbar-actions" data-theme-slot></div>
    </div>
  `);

  // theme.js only auto-fills [data-theme-slot] on DOMContentLoaded; this
  // chrome is injected after that, so the toggle is added explicitly here.
  const slot = document.querySelector('.app-topbar-actions[data-theme-slot]');
  if (slot && typeof window.themeToggleMarkup === 'function') {
    slot.insertAdjacentHTML('beforeend', window.themeToggleMarkup());
  }
}

function wireShellInteractions() {
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const toggle = document.getElementById('topbarToggle');
  const logoutBtn = document.getElementById('logoutBtn');

  function closeSidebar() {
    sidebar.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    }
  }
  function openSidebar() {
    sidebar.classList.add('is-open');
    backdrop.classList.add('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    const firstLink = sidebar.querySelector('.app-nav a');
    if (firstLink) firstLink.focus();
  }

  if (toggle) {
    toggle.addEventListener('click', () => {
      if (sidebar.classList.contains('is-open')) closeSidebar();
      else openSidebar();
    });
  }
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  // Report (and any future grouped nav item): click to expand/collapse.
  document.querySelectorAll('.nav-group-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.nav-group');
      const open = !group.classList.contains('is-open');
      group.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  // Escape closes the mobile drawer — keyboard users should never be
  // trapped behind an overlay they can only dismiss by pointer.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.classList.contains('is-open')) closeSidebar();
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      window.setLoading(logoutBtn, true, 'Logging out\u2026');
      await apiRequest('/auth/logout', { method: 'POST' });
      window.location.href = '/login.html';
    });
  }
}

function populateSidebarFooter(profile) {
  const userEl = document.getElementById('sidebarUser');
  const walletEl = document.getElementById('sidebarWallet');
  const avatarEl = document.getElementById('sidebarAvatar');
  const codeEl = document.getElementById('sidebarReferCode');

  if (userEl) userEl.querySelector('strong').textContent = profile.fullName;
  if (walletEl) {
    // Animated only on the shell's own load, so the balance never appears
    // to "change" — it always settles on the exact API value.
    window.countUp(walletEl, profile.walletBalance, formatRupees);
  }
  if (avatarEl) avatarEl.textContent = initialsOf(profile.fullName);
  if (codeEl && profile.referCode) codeEl.textContent = profile.referCode;
}

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '\u2022';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
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
