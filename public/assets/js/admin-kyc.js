/**
 * public/assets/js/admin-kyc.js
 *
 * admin-kyc.html only — wired to Checkpoint 8/9's `GET /admin/kyc-
 * submissions`, which returns FULL, unmasked Aadhaar/PAN/account numbers
 * (spec1.md's explicit admin-view carve-out from its own masking rule —
 * see admin.controller.js's file header for the full reasoning).
 *
 * *** MASKED-BY-DEFAULT DISPLAY (Type A only) — a UI choice, not a
 * *** backend one
 * The API already sends full Type A values (that's the whole point of
 * this endpoint) — this page just doesn't SHOW them until an admin
 * clicks "Reveal" on that specific row. No extra request happens on
 * reveal; the full value was already in memory from the initial fetch.
 * Purely a shoulder-surfing/screen-share safety default for a page
 * likely to be open during a support call — changes nothing about what
 * data is transmitted or what the admin is permitted to see. Type B
 * (UPI ID) has no reveal toggle: the admin endpoint doesn't even return
 * a masked variant for it (only `upiId`, full) — UPI IDs are routinely
 * shared openly (the same way an email address is), so there's no
 * masked-preview counterpart to toggle between.
 */

let typeAData = [];
let typeBData = [];

document.addEventListener('DOMContentLoaded', async () => {
  const admin = await initAdminShell();
  if (!admin) return;

  await loadSubmissions();
});

async function loadSubmissions() {
  const result = await apiRequest('/admin/kyc-submissions');

  if (!result.ok) {
    document.getElementById('typeAWrap').innerHTML = '<div class="alert alert-error" style="margin:22px;">Could not load KYC submissions.</div>';
    document.getElementById('typeBWrap').innerHTML = '';
    return;
  }

  typeAData = result.data.typeA;
  typeBData = result.data.typeB;
  renderTypeA();
  renderTypeB();
}

function renderTypeA() {
  const wrap = document.getElementById('typeAWrap');
  if (typeAData.length === 0) {
    wrap.innerHTML = '<p class="empty-state" style="padding:0 22px 22px;">No bank KYC submissions yet.</p>';
    return;
  }

  const rows = typeAData.map((row, i) => `
    <tr>
      <td>${escapeHtml(row.userFullName)}<br><span class="refer-code">${escapeHtml(row.userReferCode)}</span></td>
      <td>${escapeHtml(row.accountHolderName)} \u2014 ${escapeHtml(row.bankName)}</td>
      <td class="masked-cell" id="typeAValue${i}">${escapeHtml(row.accountNumberMaskedPreview)} \u00b7 ${escapeHtml(row.aadhaarNumberMaskedPreview)} \u00b7 ${escapeHtml(row.panNumberMaskedPreview)}</td>
      <td><span class="status-pill ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td>
      <td><button class="reveal-toggle" type="button" data-reveal-index="${i}">Reveal</button></td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>User</th><th>Account holder / Bank</th><th>Account \u00b7 Aadhaar \u00b7 PAN</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-reveal-index]').forEach((btn) => {
    btn.addEventListener('click', () => toggleReveal(Number(btn.dataset.revealIndex), btn));
  });
}

function renderTypeB() {
  const wrap = document.getElementById('typeBWrap');
  if (typeBData.length === 0) {
    wrap.innerHTML = '<p class="empty-state" style="padding:0 22px 22px;">No UPI KYC submissions yet.</p>';
    return;
  }

  const rows = typeBData.map((row) => `
    <tr>
      <td>${escapeHtml(row.userFullName)}<br><span class="refer-code">${escapeHtml(row.userReferCode)}</span></td>
      <td class="masked-cell">${escapeHtml(row.upiId)}</td>
      <td><span class="status-pill ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>User</th><th>UPI ID</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function toggleReveal(index, button) {
  const row = typeAData[index];
  const cell = document.getElementById(`typeAValue${index}`);
  const isRevealed = button.dataset.revealed === 'true';

  if (isRevealed) {
    cell.textContent = `${row.accountNumberMaskedPreview} \u00b7 ${row.aadhaarNumberMaskedPreview} \u00b7 ${row.panNumberMaskedPreview}`;
    button.textContent = 'Reveal';
    button.dataset.revealed = 'false';
  } else {
    cell.textContent = `${row.accountNumber} \u00b7 ${row.aadhaarNumber} \u00b7 ${row.panNumber}`;
    button.textContent = 'Hide';
    button.dataset.revealed = 'true';
  }
}
