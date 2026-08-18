/**
 * public/assets/js/admin-withdrawals.js
 *
 * admin-withdrawals.html only — wired to Checkpoint 8's
 * `GET /admin/withdrawals`. Fetched once; status filter buttons just
 * filter the already-fetched array client-side, no re-fetch per click
 * (same pattern as leaderboard.js's tabs).
 */

let withdrawalsData = [];

document.addEventListener('DOMContentLoaded', async () => {
  const admin = await initAdminShell();
  if (!admin) return;

  await loadWithdrawals();
  wireFilters();
});

async function loadWithdrawals() {
  const wrap = document.getElementById('withdrawalsWrap');
  const result = await apiRequest('/admin/withdrawals');

  if (!result.ok) {
    wrap.innerHTML = '<div class="alert alert-error" style="margin:22px;">Could not load withdrawals.</div>';
    return;
  }

  withdrawalsData = result.data.withdrawals;
  render('all');
}

function wireFilters() {
  document.querySelectorAll('.filter-bar .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-bar .tab-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      render(btn.dataset.status);
    });
  });
}

function render(statusFilter) {
  const wrap = document.getElementById('withdrawalsWrap');
  const rows = statusFilter === 'all'
    ? withdrawalsData
    : withdrawalsData.filter((w) => w.status === statusFilter);

  if (rows.length === 0) {
    wrap.innerHTML = '<p class="empty-state" style="padding:0 22px 22px;">No withdrawals match this filter.</p>';
    return;
  }

  const html = rows.map((w) => `
    <tr>
      <td>${escapeHtml(w.userFullName)}<br><span class="refer-code">${escapeHtml(w.userReferCode)}</span></td>
      <td class="amount">${formatRupees(w.amount)}</td>
      <td style="text-transform:uppercase; font-size:0.82rem;">${escapeHtml(w.method)}</td>
      <td><span class="status-pill ${escapeHtml(w.status)}">${escapeHtml(w.status)}</span>${w.failureReason ? `<div style="font-size:0.78rem; color:var(--danger); margin-top:4px;">${escapeHtml(w.failureReason)}</div>` : ''}</td>
      <td class="mono" style="font-size:0.78rem; color:var(--text-faint);">${w.payoutGatewayReference ? escapeHtml(w.payoutGatewayReference) : '\u2014'}</td>
      <td>${new Date(w.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>User</th><th>Amount</th><th>Method</th><th>Status</th><th>Reference</th><th>Date</th></tr></thead>
      <tbody>${html}</tbody>
    </table>
  `;
}
