/**
 * public/assets/js/dashboard.js
 *
 * dashboard.html only — wired to Checkpoint 7's `GET /user/dashboard`
 * (revenue today/7d/30d/all-time, a 30-day chart, owned courses, and a
 * searchable recent-referrals list).
 *
 * The bar chart is a plain CSS flexbox of `<div>` bars sized by inline
 * `height` percentage — no charting library, matching Checkpoint 10's
 * lean-dependency decision for this frontend.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const profile = await initAppShell();
  if (!profile) return; // already redirecting to /login.html

  document.getElementById('welcomeLine').textContent =
    `Welcome back, ${profile.fullName.split(' ')[0]}. Here's how your referrals are doing.`;

  showDashboardSkeletons();
  await loadDashboard();

  let searchTimer = null;
  document.getElementById('referralSearch').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    const value = event.target.value;
    searchTimer = setTimeout(() => loadReferralsOnly(value), 300);
  });
});

/**
 * Skeletons render immediately so the page never shows a blank frame or a
 * row of em-dashes while the single /user/dashboard call is in flight.
 */
function showDashboardSkeletons() {
  document.getElementById('revenueChart').innerHTML =
    '<div class="skeleton" style="height:100%;width:100%;"></div>';
  document.getElementById('ownedCoursesGrid').innerHTML = window.skeleton(3, 'card');
  document.getElementById('referralsTableWrap').innerHTML =
    '<div style="padding:18px 22px 22px;">' + window.skeleton(4) + '</div>';
}

async function loadDashboard() {
  const result = await apiRequest('/user/dashboard');
  if (!result.ok) {
    document.getElementById('revenueChart').innerHTML = '';
    document.getElementById('ownedCoursesGrid').innerHTML = '';
    document.getElementById('referralsTableWrap').innerHTML = '';
    document.querySelector('.app-main').insertAdjacentHTML(
      'afterbegin',
      window.errorState('Could not load your dashboard.', 'Retry')
    );
    const retry = document.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', () => window.location.reload());
    return;
  }

  const data = result.data;
  renderStats(data.revenue);
  renderChart(data.revenueChart);
  renderOwnedCourses(data.ownedCourses);
  renderReferrals(data.recentReferrals);
}

async function loadReferralsOnly(search) {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  const result = await apiRequest(`/user/dashboard${query}`);
  if (result.ok) renderReferrals(result.data.recentReferrals);
}

function renderStats(revenue) {
  // countUp animates toward the API value and always lands exactly on it.
  window.countUp(document.getElementById('statToday'), revenue.today, formatRupees);
  window.countUp(document.getElementById('statWeek'), revenue.last7Days, formatRupees);
  window.countUp(document.getElementById('statMonth'), revenue.last30Days, formatRupees);
  window.countUp(document.getElementById('statAllTime'), revenue.allTime, formatRupees);
}

function renderChart(chartData) {
  const container = document.getElementById('revenueChart');
  if (!chartData || chartData.length === 0) {
    container.innerHTML = '<p class="empty-state">No data yet.</p>';
    return;
  }

  const max = Math.max(1, ...chartData.map((d) => Number(d.amount)));
  container.innerHTML = chartData.map((d, i) => {
    const amount = Number(d.amount);
    const heightPct = Math.max(2, Math.round((amount / max) * 100));
    const dateLabel = new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    // `title` gives a native tooltip with no JS/positioning cost, and is
    // announced by screen readers unlike a purely visual data-attribute.
    return `<div class="bar" style="height:${heightPct}%;animation-delay:${Math.min(i * 12, 300)}ms" data-value="${amount}" title="${dateLabel}: ${formatRupees(amount)}"></div>`;
  }).join('');
}

function renderOwnedCourses(courses) {
  const grid = document.getElementById('ownedCoursesGrid');
  if (!courses || courses.length === 0) {
    grid.innerHTML = '<p class="empty-state">You don\u2019t own any courses yet. <a href="/upgrade.html">Browse courses</a>.</p>';
    return;
  }
  grid.innerHTML = courses.map((c) => `
    <div class="course-card">
      <h3>${escapeHtml(c.name)}</h3>
      <p class="desc">${escapeHtml(c.description || '')}</p>
      <div class="course-price mono">${formatRupees(c.price)}</div>
      <a class="btn btn-ghost btn-sm" href="/my-courses.html">Open lectures</a>
    </div>
  `).join('');
}

function renderReferrals(referrals) {
  const wrap = document.getElementById('referralsTableWrap');
  if (!referrals || referrals.length === 0) {
    wrap.innerHTML = '<p class="empty-state" style="padding:0 22px 22px;">No referrals yet — share your affiliate link to get started.</p>';
    return;
  }

  const rows = referrals.map((r) => `
    <tr>
      <td><strong>${escapeHtml(r.buyerName)}</strong></td>
      <td><span class="refer-code">${escapeHtml(r.buyerReferCode)}</span></td>
      <td>${escapeHtml(r.packageName)}</td>
      <td class="amount credit">${formatRupees(r.amount)}</td>
      <td>${new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead>
        <tr><th>Name</th><th>Refer ID</th><th>Package</th><th>Amount</th><th>Date</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table></div>
  `;
}
