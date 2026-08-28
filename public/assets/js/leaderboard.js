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
  const chart = document.getElementById('leaderboardChart');
  const entries = (leaderboardData && leaderboardData[windowKey]) || [];
  const myIndex = currentReferCode
    ? entries.findIndex((e) => e.referCode === currentReferCode)
    : -1;

  if (podium) podium.innerHTML = entries.length >= 3 ? podiumHtml(entries.slice(0, 3)) : '';
  if (chart) chart.innerHTML = chartHtml(entries, myIndex);

  if (entries.length === 0) {
    wrap.innerHTML = '<p class="empty-state" style="margin:22px;">No earners in this window yet \u2014 share your link and you could be first.</p>';
    return;
  }

  const rows = entries.map((entry, i) => {
    const rank = i + 1;
    const isMe = currentReferCode && entry.referCode === currentReferCode;
    return `
      <tr${isMe ? ' class="is-me"' : ''}>
        <td data-label="Rank"><span class="rank-badge rank-${rank <= 3 ? rank : ''}">${rank}</span></td>
        <td data-label="Name"><strong>${escapeHtml(entry.fullName)}</strong>${isMe ? ' <span class="badge badge-info">You</span>' : ''}</td>
        <td data-label="Refer code"><span class="refer-code">${escapeHtml(entry.referCode)}</span></td>
        <td data-label="Total earned" class="amount credit">${formatRupees(entry.totalEarned)}</td>
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

/**
 * Graphical ranking view: animated bars for the top earners plus a
 * highlighted bar for the signed-in user's own rank (appended when they
 * are outside the visible top slice).
 */
function chartHtml(entries, myIndex) {
  if (!entries.length) return '<p class="empty-state" style="padding:18px;">Nothing to chart yet.</p>';

  const top = entries.slice(0, 5).map((e, i) => ({ entry: e, rank: i + 1 }));
  if (myIndex >= 5) top.push({ entry: entries[myIndex], rank: myIndex + 1 });

  const max = Math.max.apply(null, top.map((r) => Number(r.entry.totalEarned) || 0)) || 1;

  const bars = top.map((row, i) => {
    const value = Number(row.entry.totalEarned) || 0;
    const pct = Math.max(6, Math.round((value / max) * 100));
    const isMe = currentReferCode && row.entry.referCode === currentReferCode;
    return `
      <div class="lb-bar-row${isMe ? ' is-me' : ''}" style="--i:${i}">
        <span class="lb-rank rank-badge rank-${row.rank <= 3 ? row.rank : ''}">${row.rank}</span>
        <div class="lb-bar-main">
          <div class="lb-bar-label">
            <strong>${escapeHtml(row.entry.fullName)}</strong>
            ${isMe ? '<span class="badge badge-info">You</span>' : ''}
            <span class="lb-bar-value mono">${formatRupees(value)}</span>
          </div>
          <div class="lb-bar-track"><span class="lb-bar-fill" style="--w:${pct}%"></span></div>
        </div>
      </div>`;
  }).join('');

  const mine = myIndex >= 0
    ? `<div class="lb-myrank"><span>Your rank</span><strong>#${myIndex + 1}</strong><span class="mono">${formatRupees(entries[myIndex].totalEarned)}</span></div>`
    : '<div class="lb-myrank is-empty"><span>Your rank</span><strong>Unranked</strong><span>Share your link to enter the board</span></div>';

  return `<div class="lb-chart-head"><h3>Ranking graph</h3>${mine}</div><div class="lb-bars">${bars}</div>`;
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
