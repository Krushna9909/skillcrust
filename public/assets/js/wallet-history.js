/**
 * public/assets/js/wallet-history.js — Report > Wallet History.
 *
 * `GET /user/wallet-history` returns the full money-movement ledger
 * (commission credits + payout debits) already walked into an existing /
 * updated balance pair per row, newest first.
 */

let ledger = [];

document.addEventListener('DOMContentLoaded', async () => {
  const profile = await initAppShell();
  if (!profile) return;

  document.getElementById('historyTableWrap').innerHTML =
    '<div style="padding:18px 22px 22px;">' + window.skeleton(4) + '</div>';

  await loadHistory();

  const search = document.getElementById('historySearch');
  if (search) search.addEventListener('input', () => renderHistory(filterHistory(search.value)));
});

async function loadHistory() {
  const wrap = document.getElementById('historyTableWrap');
  const result = await apiRequest('/user/wallet-history');

  if (!result.ok) {
    wrap.innerHTML = '<div style="padding:22px;">' + window.errorState('Could not load your wallet history.', 'Retry') + '</div>';
    const retry = wrap.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', () => loadHistory());
    return;
  }

  ledger = result.data.entries || [];
  renderHistory(ledger);
}

function filterHistory(term) {
  const q = String(term || '').trim().toLowerCase();
  if (!q) return ledger;
  return ledger.filter((e) =>
    [e.type, e.source, e.status].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
  );
}

function renderHistory(entries) {
  const wrap = document.getElementById('historyTableWrap');
  const countEl = document.getElementById('historyCount');
  if (countEl) {
    countEl.textContent = entries.length === ledger.length
      ? `${ledger.length} transaction${ledger.length === 1 ? '' : 's'}`
      : `${entries.length} of ${ledger.length} shown`;
  }

  if (!entries.length) {
    wrap.innerHTML = '<p class="empty-state" style="padding:22px;">No wallet activity yet \u2014 commissions will appear here as your team buys courses.</p>';
    return;
  }

  const rows = entries.map((e) => `
    <tr>
      <td>${formatDateTime(e.date)}</td>
      <td>${escapeHtml(e.type)}</td>
      <td>${escapeHtml(e.source || '\u2014')}</td>
      <td class="amount ${e.kind === 'credit' ? 'credit' : 'debit'}">${e.kind === 'credit' ? '+' : '\u2212'}${formatRupees(e.amount)}</td>
      <td class="cell-mono">${formatRupees(e.existingAmount)}</td>
      <td class="cell-mono"><strong>${formatRupees(e.updatedAmount)}</strong></td>
      <td><span class="status-pill ${escapeHtml(e.status)}">${escapeHtml(e.status)}</span></td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <div class="table-scroll"><table class="data-table report-table">
      <thead><tr>
        <th>Date</th><th>Type</th><th>Source</th><th>Amount</th>
        <th>Existing amount</th><th>Updated amount</th><th>Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  `;
}

function formatDateTime(value) {
  if (!value) return '\u2014';
  const d = new Date(value);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' \u00b7 ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
