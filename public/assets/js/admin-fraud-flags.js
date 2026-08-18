/**
 * public/assets/js/admin-fraud-flags.js
 *
 * admin-fraud-flags.html only — wired to Checkpoint 9's
 * `GET /admin/fraud-flags`. Rendered as cards, not a table — each flag
 * has a variable-length list of implicated users, which fits a card's
 * flexible layout better than a fixed-column table row.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const admin = await initAdminShell();
  if (!admin) return;

  await loadFlags();
});

async function loadFlags() {
  const wrap = document.getElementById('flagsWrap');
  const result = await apiRequest('/admin/fraud-flags');

  if (!result.ok) {
    wrap.innerHTML = '<div class="alert alert-error">Could not load fraud flags.</div>';
    return;
  }

  const flags = result.data.flags;
  if (!flags || flags.length === 0) {
    wrap.innerHTML = '<p class="empty-state">No fraud flags on record.</p>';
    return;
  }

  wrap.innerHTML = flags.map(flagCardHtml).join('');
}

function flagCardHtml(flag) {
  const userChips = flag.users.map((u) =>
    `<span class="badge" style="margin:0;">${escapeHtml(u.fullName)} (${escapeHtml(u.referCode)})</span>`
  ).join('');

  const detailsText = flag.details
    ? `${flag.details.signupCount} signups in a ${flag.details.windowHours}-hour window`
    : '';

  return `
    <div class="card flag-card">
      <div class="flag-head">
        <div>
          <span class="status-pill failed" style="text-transform:none;">${escapeHtml(flag.flagType.replace(/_/g, ' '))}</span>
          <span class="mono" style="margin-left:10px; color:var(--text-muted); font-size:0.85rem;">IP: ${escapeHtml(flag.ipAddress)}</span>
        </div>
        <span style="font-size:0.8rem; color:var(--text-faint);">${new Date(flag.createdAt).toLocaleString('en-IN')}</span>
      </div>
      <p style="margin:10px 0 0; font-size:0.85rem; color:var(--text-muted);">${escapeHtml(detailsText)}</p>
      <div class="flag-users">${userChips}</div>
    </div>
  `;
}
