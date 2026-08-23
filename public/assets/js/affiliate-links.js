/**
 * public/assets/js/affiliate-links.js
 *
 * affiliate-links.html only — wired to Checkpoint 7's
 * `GET /user/affiliate-links`.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const profile = await initAppShell();
  if (!profile) return;

  renderNetworkDiagram(profile);
  await loadLinks();
});

/**
 * A two-level illustration of how the referral chain pays — labelled with
 * the viewer's OWN refer code (real data from /user/profile). It shows the
 * structure of the program, not invented counts or earnings.
 */
function renderNetworkDiagram(profile) {
  const host = document.getElementById('networkDiagram');
  if (!host) return;
  host.innerHTML = `
    <div class="tree-level">
      <span class="tree-level-label">You</span>
      <div class="tree-nodes">
        <span class="tree-node is-you">${escapeHtml(profile.fullName)} \u00B7 ${escapeHtml(profile.referCode || '')}</span>
      </div>
    </div>
    <div class="tree-connector"></div>
    <div class="tree-level">
      <span class="tree-level-label">Level 1 \u2014 people who join with your link</span>
      <div class="tree-nodes">
        <span class="tree-node" style="animation-delay:.1s">Direct referral</span>
        <span class="tree-node" style="animation-delay:.16s">Direct referral</span>
        <span class="tree-node" style="animation-delay:.22s">Direct referral</span>
      </div>
    </div>
    <div class="tree-connector"></div>
    <div class="tree-level">
      <span class="tree-level-label">Level 2 \u2014 people they refer</span>
      <div class="tree-nodes">
        <span class="tree-node" style="animation-delay:.3s">Indirect referral</span>
        <span class="tree-node" style="animation-delay:.36s">Indirect referral</span>
      </div>
    </div>
  `;
}

async function loadLinks() {
  const container = document.getElementById('linksContainer');
  container.innerHTML = window.skeleton(2, 'card');
  const result = await apiRequest('/user/affiliate-links');

  if (!result.ok) {
    container.innerHTML = window.errorState('Could not load your affiliate links.', 'Retry');
    const retry = container.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', () => loadLinks());
    return;
  }

  const links = result.data.affiliateLinks;
  // The server builds these from FRONTEND_URL, which can still be a
  // localhost default in some environments. Re-point every link at the
  // origin the page is actually being served from, so a shared link
  // always works for the person receiving it.
  links.forEach((link) => {
    try {
      const parsed = new URL(link.url, window.location.origin);
      link.url = window.location.origin + parsed.pathname + parsed.search;
    } catch (err) {
      /* leave the server value untouched if it isn't parseable */
    }
  });
  if (!links || links.length === 0) {
    container.innerHTML = '<p class="empty-state">You don\u2019t own any courses yet, so there\u2019s nothing to share. <a href="/upgrade.html">Browse courses</a>.</p>';
    return;
  }

  container.innerHTML = links.map((link, i) => `
    <div class="link-card">
      <div class="row">
        <h3 style="margin:0;">${escapeHtml(link.courseName)}</h3>
        <span class="badge row-end">Level 1 &amp; 2 payouts</span>
      </div>
      <div class="link-url" id="linkUrl${i}">${escapeHtml(link.url)}</div>
      <div class="link-actions">
        <button class="btn btn-primary" type="button" data-copy-index="${i}">Copy link</button>
        <a class="btn btn-ghost" href="https://wa.me/?text=${encodeURIComponent(link.url)}" target="_blank" rel="noopener">Share on WhatsApp</a>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-copy-index]').forEach((btn) => {
    const index = Number(btn.dataset.copyIndex);
    btn.addEventListener('click', () => copyLink(btn, links[index].url, document.getElementById(`linkUrl${index}`)));
  });
}

async function copyLink(button, url, urlElement) {
  const originalText = button.textContent;
  try {
    await window.copyToClipboard(url);
    button.classList.add('is-copied');
    button.textContent = '\u2713 Copied';
    window.toast('Referral link copied to clipboard', 'success');
  } catch (err) {
    // Clipboard API can fail (permissions, insecure context over plain
    // HTTP, etc.) — fall back to selecting the visible link text so the
    // person can copy it manually (Ctrl/Cmd+C) instead of the button
    // silently doing nothing.
    button.textContent = 'Selected — press Ctrl/Cmd+C';
    if (urlElement && window.getSelection) {
      const range = document.createRange();
      range.selectNodeContents(urlElement);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
  setTimeout(() => {
    button.classList.remove('is-copied');
    button.textContent = originalText;
  }, 2200);
}
