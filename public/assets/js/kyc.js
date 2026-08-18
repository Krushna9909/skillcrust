/**
 * public/assets/js/kyc.js
 *
 * kyc.html only — wired to Checkpoint 4's `GET /kyc`, `POST /kyc/bank`,
 * `POST /kyc/upi`. Both submission endpoints upsert (resubmission is
 * just submitting the form again) — the forms are always shown, blank,
 * ready for a first submission or a resubmission; the status card above
 * each form shows what's currently on file (masked, per Checkpoint 4's
 * response shape — this page never sees or handles a full Aadhaar/PAN/
 * account number after the moment the person types it into the form).
 */

document.addEventListener('DOMContentLoaded', async () => {
  const profile = await initAppShell();
  if (!profile) return;

  await loadKycStatus();
  wireTypeAForm();
  wireTypeBForm();
  wireKycValidation();
});

/* ---------------------------------------------------------------------------
 * Client-side validation + live formatting. Presentation only — Checkpoint
 * 4's server-side validators remain the source of truth; this just stops
 * obviously malformed values and gives instant feedback.
 * ------------------------------------------------------------------------ */
const KYC_RULES = {
  accountNumber: { test: (v) => /^\d{9,18}$/.test(v), message: 'Account number must be 9–18 digits.' },
  ifscCode: { test: (v) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v), message: 'Enter a valid IFSC code (e.g. ABCD0123456).' },
  aadhaarNumber: { test: (v) => /^\d{12}$/.test(v), message: 'Aadhaar must be exactly 12 digits.' },
  panNumber: { test: (v) => /^[A-Z]{5}\d{4}[A-Z]$/.test(v), message: 'Enter a valid PAN (e.g. ABCDE1234F).' },
  upiId: { test: (v) => /^[\w.\-]{2,64}@[A-Za-z]{2,32}$/.test(v), message: 'Enter a valid UPI ID like name@bank.' },
};

/** Value actually sent to the API — grouping spaces are display-only. */
function kycValue(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  let value = el.value.trim();
  if (id === 'accountNumber' || id === 'aadhaarNumber') value = value.replace(/\s+/g, '');
  if (id === 'ifscCode' || id === 'panNumber') value = value.toUpperCase().replace(/\s+/g, '');
  return value;
}

function validateKycField(id) {
  const el = document.getElementById(id);
  const rule = KYC_RULES[id];
  if (!el || !rule) return true;
  const value = kycValue(id);
  if (!value) return window.fieldError(el, 'This field is required.');
  if (!rule.test(value)) return window.fieldError(el, rule.message);
  return window.fieldError(el, null);
}

function validateKycFields(ids) {
  // Validate every field (not just the first bad one) so the person sees
  // everything that needs fixing in one pass.
  return ids.map(validateKycField).every(Boolean);
}

function wireKycValidation() {
  ['accountNumber', 'aadhaarNumber'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const digits = el.value.replace(/\D/g, '').slice(0, id === 'aadhaarNumber' ? 12 : 18);
      el.value = window.groupDigits(digits, 4);
    });
  });

  Object.keys(KYC_RULES).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', () => { if (el.value.trim()) validateKycField(id); });
    el.addEventListener('input', () => { if (el.classList.contains('is-invalid')) validateKycField(id); });
  });
}

async function loadKycStatus() {
  const result = await apiRequest('/kyc');
  if (!result.ok) return;

  renderTypeAStatus(result.data.kycTypeA);
  renderTypeBStatus(result.data.kycTypeB);
}

function renderTypeAStatus(kyc) {
  const el = document.getElementById('typeAStatus');
  if (!kyc) {
    el.innerHTML = '<p class="empty-state" style="padding:0 0 14px;">Not submitted yet.</p>';
    return;
  }
  el.innerHTML = `
    <div class="card kyc-status-card">
      <div>
        <span class="status-pill ${escapeHtml(kyc.status)}">${escapeHtml(kyc.status)}</span>
        <div class="masked-fields">
          <span>${escapeHtml(kyc.accountHolderName)} \u2014 ${escapeHtml(kyc.bankName)}</span>
          <span>Account ${escapeHtml(kyc.accountNumberMasked)} \u00b7 ${escapeHtml(kyc.ifscCode)}</span>
          <span>Aadhaar ${escapeHtml(kyc.aadhaarNumberMasked)} \u00b7 PAN ${escapeHtml(kyc.panNumberMasked)}</span>
        </div>
      </div>
      <span style="font-size:0.8rem; color:var(--text-faint);">Updated ${new Date(kyc.updatedAt).toLocaleDateString('en-IN')}</span>
    </div>
  `;
}

function renderTypeBStatus(kyc) {
  const el = document.getElementById('typeBStatus');
  if (!kyc) {
    el.innerHTML = '<p class="empty-state" style="padding:0 0 14px;">Not submitted yet.</p>';
    return;
  }
  el.innerHTML = `
    <div class="card kyc-status-card">
      <div>
        <span class="status-pill ${escapeHtml(kyc.status)}">${escapeHtml(kyc.status)}</span>
        <div class="masked-fields"><span>UPI ID: ${escapeHtml(kyc.upiIdMasked)}</span></div>
      </div>
      <span style="font-size:0.8rem; color:var(--text-faint);">Updated ${new Date(kyc.updatedAt).toLocaleDateString('en-IN')}</span>
    </div>
  `;
}

function wireTypeAForm() {
  const form = document.getElementById('typeAForm');
  const submitBtn = document.getElementById('typeASubmitBtn');
  const messageEl = document.getElementById('typeAMessage');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageEl.className = 'form-message';

    const payload = {
      accountHolderName: document.getElementById('accountHolderName').value.trim(),
      bankName: document.getElementById('bankName').value.trim(),
      accountNumber: kycValue('accountNumber'),
      ifscCode: kycValue('ifscCode'),
      aadhaarNumber: kycValue('aadhaarNumber'),
      panNumber: kycValue('panNumber'),
    };

    if (!validateKycFields(['accountNumber', 'ifscCode', 'aadhaarNumber', 'panNumber'])) {
      messageEl.textContent = 'Please fix the highlighted fields before saving.';
      messageEl.className = 'form-message is-error';
      window.toast('Please fix the highlighted fields.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving\u2026';
    const result = await apiRequest('/kyc/bank', { method: 'POST', body: payload });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save bank KYC';

    if (!result.ok) {
      messageEl.textContent = apiErrorMessage(result, 'Could not save your bank KYC.');
    messageEl.className = 'form-message is-error';
    window.toast(messageEl.textContent, 'error');
      return;
    }

    messageEl.textContent = 'Bank KYC saved.';
    messageEl.className = 'form-message is-success';
    window.toast(messageEl.textContent, 'success');
    form.reset();
    renderTypeAStatus(result.data.kycTypeA);
  });
}

function wireTypeBForm() {
  const form = document.getElementById('typeBForm');
  const submitBtn = document.getElementById('typeBSubmitBtn');
  const messageEl = document.getElementById('typeBMessage');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageEl.className = 'form-message';

    const payload = { upiId: kycValue('upiId') };

    if (!validateKycFields(['upiId'])) {
      messageEl.textContent = 'Please enter a valid UPI ID.';
      messageEl.className = 'form-message is-error';
      window.toast('Please enter a valid UPI ID.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving\u2026';
    const result = await apiRequest('/kyc/upi', { method: 'POST', body: payload });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save UPI KYC';

    if (!result.ok) {
      messageEl.textContent = apiErrorMessage(result, 'Could not save your UPI KYC.');
    messageEl.className = 'form-message is-error';
    window.toast(messageEl.textContent, 'error');
      return;
    }

    messageEl.textContent = 'UPI KYC saved.';
    messageEl.className = 'form-message is-success';
    window.toast(messageEl.textContent, 'success');
    form.reset();
    renderTypeBStatus(result.data.kycTypeB);
  });
}
