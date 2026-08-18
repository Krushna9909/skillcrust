/**
 * public/assets/js/leaderboard.js
 *
 * leaderboard.html only — wired to Checkpoint 7's `GET /user/leaderboard`,
 * which returns all four windows (today/last7Days/last30Days/allTime) in
 * one response — fetched once on load, tabs just switch which array is
 * rendered, no re-fetch per tab click.
 */

let leaderboardData = null;
let currentReferCode = null;

document.addEventListener('DOMContentLoaded', async () => {
  const profile = await initAppShell();
  if (!profile) return;

  currentReferCode = profile.referCode || null;
  await loadLeaderboard();
  wireTabs();
});

async function loadLeaderboard() {
  const wrap = document.getElementById('leaderboardTableWrap');
  wrap.innerHTML = '<div style="padding:20px 22px;">' + window.skeleton(5) + '</div>';
  const result = await apiRequest('/user/leaderboard');

  if (!result.ok) {
    wrap.innerHTML = '<div style="padding:22px;">' + window.errorState('Could not load the leaderboard.', 'Retry') + '</div>';
    const retry = wrap.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', () => loadLeaderboard());
    return;
  }

  leaderboardData = result.data;
  renderWindow('today');
}

function wireTabs() {
  document.querySelectorAll('#leaderboardTabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#leaderboardTabs .tab-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      renderWindow(btn.dataset.window);
    });
  });
}

function renderWindow(windowKey) {
  const wrap = document.getElementById('leaderboardTableWrap');
  const podium = document.getElementById('leaderboardPodium');
  const entries = (leaderboardData && leaderboardData[windowKey]) || [];

  if (podium) podium.innerHTML = entries.length >= 3 ? podiumHtml(entries.slice(0, 3)) : '';

  if (entries.length === 0) {
    wrap.innerHTML = '<p class="empty-state" style="margin:22px;">No earners in this window yet \u2014 share your link and you could be first.</p>';
    return;
  }

  const rows = entries.map((entry, i) => {
    const rank = i + 1;
    const isMe = currentReferCode && entry.referCode === currentReferCode;
    return `
      <tr${isMe ? ' class="is-me"' : ''}>
        <td><span class="rank-badge rank-${rank <= 3 ? rank : ''}">${rank}</span></td>
        <td><strong>${escapeHtml(entry.fullName)}</strong>${isMe ? ' <span class="badge badge-info">You</span>' : ''}</td>
        <td><span class="refer-code">${escapeHtml(entry.referCode)}</span></td>
        <td class="amount credit">${formatRupees(entry.totalEarned)}</td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Rank</th><th>Name</th><th>Refer Code</th><th>Total Earned</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  `;
}

/** Top three, rendered from the same real entries the table below uses. */
function podiumHtml(top) {
  const order = [1, 0, 2]; // silver, gold, bronze — gold visually centred
  // Numerals instead of medal emoji: emoji render inconsistently across
  // platforms and are unreadable when a system lacks the glyph.
  const medals = ['1st', '2nd', '3rd'];
  return order.map((idx) => {
    const entry = top[idx];
    return `
      <div class="podium-card rank-${idx + 1}">
        <span class="podium-medal" aria-hidden="true">${medals[idx]}</span>
        <strong>${escapeHtml(entry.fullName)}</strong>
        <span class="refer-code">${escapeHtml(entry.referCode)}</span>
        <span class="mono">${formatRupees(entry.totalEarned)}</span>
      </div>
    `;
  }).join('');
}
