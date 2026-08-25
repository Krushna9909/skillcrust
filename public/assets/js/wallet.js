/**
 * public/assets/js/wallet.js
 *
 * wallet.html only — wired to Checkpoint 5's `GET /wallet`,
 * `POST /wallet/withdraw`, `GET /wallet/withdrawals`. Also fetches
 * Checkpoint 4's `GET /kyc` (read-only, just to show a "complete your
 * KYC first" hint for whichever method isn't set up yet) — the actual
 * gating is enforced server-side either way (`wallet.controller.js`'s
 * `requestWithdrawal`), this is purely a UX head start so the person
 * doesn't have to submit-and-fail to find out.
 *
 * No `simulate` field is ever sent — same reasoning as upgrade.js:
 * that's a dev/test-only backend parameter, not something a real
 * "Request withdrawal" button should expose.
 */

let selectedMethod = 'bank';
let hasTypeAKyc = false;
let hasTypeBKyc = false;
let kycTypeA = null;
let kycTypeB = null;

document.addEventListener('DOMContentLoaded', async () => {
  const profile = await initAppShell();
  if (!profile) return;

  document.getElementById('walletBalance').textContent = formatRupees(profile.walletBalance);

  document.getElementById('withdrawalsTableWrap').innerHTML =
    '<div style="padding:18px 22px 22px;">' + window.skeleton(3) + '</div>';
  await Promise.all([loadKycStatus(), loadWithdrawals()]);
  updateKycHint();
  wireMethodToggle();
  wireWithdrawForm();
});

async function loadKycStatus() {
  const result = await apiRequest('/kyc');
  if (result.ok) {
    kycTypeA = result.data.kycTypeA || null;
    kycTypeB = result.data.kycTypeB || null;
    hasTypeAKyc = !!kycTypeA;
    hasTypeBKyc = !!kycTypeB;
  }
}

async function loadWithdrawals() {
  const wrap = document.getElementById('withdrawalsTableWrap');
  const result = await apiRequest('/wallet/withdrawals');

  if (!result.ok) {
    wrap.innerHTML = '<div style="padding:22px;">' + window.errorState('Could not load withdrawal history.', 'Retry') + '</div>';
    const retry = wrap.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', () => loadWithdrawals());
    return;
  }

  const withdrawals = result.data.withdrawals;
  if (!withdrawals || withdrawals.length === 0) {
    wrap.innerHTML = '<p class="empty-state" style="margin:22px;">No withdrawals yet \u2014 your payouts will appear here.</p>';
    return;
  }

  const rows = withdrawals.map((w) => `
    <tr>
      <td class="amount debit" data-label="Amount">${formatRupees(w.amount)}</td>
      <td data-label="Method" style="text-transform:uppercase; font-size:0.82rem;">${escapeHtml(w.method)}</td>
      <td data-label="Status"><span class="status-pill ${escapeHtml(w.status)}">${escapeHtml(w.status)}</span></td>
      <td data-label="Date">${new Date(w.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
    </tr>
  `).join('');


  wrap.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  `;
}

function methodAllowed(method) {
  return method === 'bank' ? hasTypeAKyc : hasTypeBKyc;
}

function selectMethod(method) {
  selectedMethod = method;
  document.querySelectorAll('#methodToggle button').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.method === method);
  });
  const bankFields = document.getElementById('bankFields');
  const upiFields = document.getElementById('upiFields');
  if (bankFields) bankFields.hidden = method !== 'bank';
  if (upiFields) upiFields.hidden = method !== 'upi';
  updateKycHint();
}

function wireMethodToggle() {
  document.querySelectorAll('#methodToggle button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!methodAllowed(btn.dataset.method)) {
        selectMethod(btn.dataset.method); // show the "complete KYC" hint
        return;
      }
      selectMethod(btn.dataset.method);
    });
  });

  // Auto-select whichever method the person has already KYC'd.
  if (!methodAllowed(selectedMethod)) {
    if (hasTypeAKyc) selectMethod('bank');
    else if (hasTypeBKyc) selectMethod('upi');
    else selectMethod(selectedMethod);
  } else {
    selectMethod(selectedMethod);
  }
}

function updateKycHint() {
  const hintEl = document.getElementById('kycHint');
  const submitBtn = document.getElementById('withdrawSubmitBtn');
  const hasKyc = methodAllowed(selectedMethod);

  document.querySelectorAll('#methodToggle button').forEach((b) => {
    const ok = methodAllowed(b.dataset.method);
    b.dataset.locked = ok ? '' : '1';
    b.title = ok ? '' : 'Complete this KYC to enable withdrawals with this method';
    const label = b.dataset.method === 'bank' ? 'Bank Account' : 'UPI';
    b.innerHTML = ok ? label : `${label}<span class="method-lock">KYC pending</span>`;
  });

  if (!hasKyc) {
    hintEl.innerHTML = `<p class="kyc-hint">You need to complete your ${selectedMethod === 'bank' ? 'bank (Type A)' : 'UPI (Type B)'} KYC before withdrawing this way. <a href="/kyc.html">Complete KYC \u2192</a></p>`;
  } else {
    hintEl.innerHTML = '';
  }
  submitBtn.disabled = !hasKyc;
}


function wireWithdrawForm() {
  const form = document.getElementById('withdrawForm');
  const submitBtn = document.getElementById('withdrawSubmitBtn');
  const messageEl = document.getElementById('withdrawMessage');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageEl.innerHTML = '';

    const amount = Number(document.getElementById('withdrawAmount').value);
    if (!Number.isFinite(amount) || amount <= 0) {
      messageEl.innerHTML = '<div class="alert alert-error">Enter a valid amount.</div>';
      return;
    }

    const payload = { amount, method: selectedMethod };

    window.setLoading(submitBtn, true, 'Processing\u2026');

    const result = await apiRequest('/wallet/withdraw', {
      method: 'POST',
      body: payload,
    });

    window.setLoading(submitBtn, false);

    if (result.ok) {
      const w = (result.data && result.data.withdrawal) || {};
      const paid = w.status === 'paid';
      messageEl.innerHTML = paid
        ? `<div class="alert alert-success">Withdrawal of ${escapeHtml(formatRupees(w.amount || amount))} completed via ${escapeHtml((w.method || selectedMethod).toUpperCase())} \u2014 the amount has been debited from your wallet.</div>`
        : '<div class="alert alert-success">Withdrawal request sent to the admin for approval \u2014 track it in your history below.</div>';
      window.toast(paid ? 'Payout completed' : 'Withdrawal request sent for approval', 'success');
      form.reset();
      let balance = result.data && result.data.walletBalance;
      if (balance === undefined || balance === null) {
        const profileResult = await apiRequest('/user/profile');
        if (profileResult.ok) balance = profileResult.data.profile.walletBalance;
      }
      if (balance !== undefined && balance !== null) {
        document.getElementById('walletBalance').textContent = formatRupees(balance);
        const sidebarWallet = document.getElementById('sidebarWallet');
        if (sidebarWallet) sidebarWallet.textContent = formatRupees(balance);
      }
      await loadWithdrawals();
    } else {
      const reason = (result.data && result.data.withdrawal && result.data.withdrawal.failureReason)
        || apiErrorMessage(result, 'Withdrawal could not be completed.');
      messageEl.innerHTML = `<div class="alert alert-error">${escapeHtml(reason)}</div>`;
      window.toast(reason, 'error');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
