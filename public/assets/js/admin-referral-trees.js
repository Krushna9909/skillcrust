/**
 * public/assets/js/admin-referral-trees.js
 *
 * admin-referral-trees.html only — wired to Checkpoint 8's
 * `GET /admin/referral-trees`, which returns a flat parent-pointer edge
 * list (every user + their direct referrer), not a server-nested tree —
 * see user.model.js's `findReferralTreeForAdmin` for why. This page
 * renders that flat list as a simple "User -> Referred by" table with
 * client-side search (debounced) rather than reconstructing a visual
 * tree/graph — sufficient for tracing any one chain by searching a name
 * or refer code, without the extra complexity of a tree-layout widget.
 */

let treeData = [];
let searchTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  const admin = await initAdminShell();
  if (!admin) return;

  await loadTree();

  document.getElementById('treeSearch').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    const value = event.target.value;
    searchTimer = setTimeout(() => render(value), 200);
  });
});

async function loadTree() {
  const wrap = document.getElementById('treeWrap');
  const result = await apiRequest('/admin/referral-trees');

  if (!result.ok) {
    wrap.innerHTML = '<div class="alert alert-error" style="margin:22px;">Could not load referral trees.</div>';
    return;
  }

  treeData = result.data.nodes;
  render('');
}

function render(searchTerm) {
  const wrap = document.getElementById('treeWrap');
  const term = searchTerm.trim().toLowerCase();

  const filtered = term
    ? treeData.filter((n) =>
        n.fullName.toLowerCase().includes(term) ||
        n.referCode.toLowerCase().includes(term) ||
        (n.referrerFullName && n.referrerFullName.toLowerCase().includes(term)) ||
        (n.referrerReferCode && n.referrerReferCode.toLowerCase().includes(term))
      )
    : treeData;

  if (filtered.length === 0) {
    wrap.innerHTML = '<p class="empty-state" style="padding:0 22px 22px;">No matching users.</p>';
    return;
  }

  const rows = filtered.map((n) => `
    <tr>
      <td>${escapeHtml(n.fullName)} ${n.isSystemAccount ? '<span class="badge" style="margin:0;">SYSTEM</span>' : ''}<br><span class="refer-code">${escapeHtml(n.referCode)}</span></td>
      <td>${n.referrerId
        ? `${escapeHtml(n.referrerFullName)}<br><span class="refer-code">${escapeHtml(n.referrerReferCode)}</span>`
        : '<span style="color:var(--text-faint);">\u2014 (root)</span>'}</td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>User</th><th>Referred by</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
