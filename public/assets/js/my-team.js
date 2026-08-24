/**
 * public/assets/js/my-team.js — Report > My Team.
 *
 * Level-1 (direct) referrals only, from `GET /user/my-team`. Search is
 * done client-side against the already-loaded rows so typing feels
 * instant; the server also accepts ?search for large teams.
 */

let teamMembers = [];

document.addEventListener('DOMContentLoaded', async () => {
  const profile = await initAppShell();
  if (!profile) return;

  document.getElementById('teamTableWrap').innerHTML =
    '<div style="padding:18px 22px 22px;">' + window.skeleton(4) + '</div>';

  await loadTeam();

  const search = document.getElementById('teamSearch');
  if (search) {
    search.addEventListener('input', () => renderTeam(filterTeam(search.value)));
  }
});

async function loadTeam() {
  const wrap = document.getElementById('teamTableWrap');
  const result = await apiRequest('/user/my-team');

  if (!result.ok) {
    wrap.innerHTML = '<div style="padding:22px;">' + window.errorState('Could not load your team.', 'Retry') + '</div>';
    const retry = wrap.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', () => loadTeam());
    return;
  }

  teamMembers = result.data.members || [];
  renderTeam(teamMembers);
}

function filterTeam(term) {
  const q = String(term || '').trim().toLowerCase();
  if (!q) return teamMembers;
  return teamMembers.filter((m) =>
    [m.name, m.email, m.phone, m.referCode, m.package]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q))
  );
}

function renderTeam(members) {
  const wrap = document.getElementById('teamTableWrap');
  const countEl = document.getElementById('teamCount');
  if (countEl) {
    countEl.textContent = members.length === teamMembers.length
      ? `${teamMembers.length} member${teamMembers.length === 1 ? '' : 's'} in Level 1`
      : `${members.length} of ${teamMembers.length} shown`;
  }

  if (!members.length) {
    wrap.innerHTML = '<p class="empty-state" style="padding:22px;">No Level 1 members yet \u2014 share your affiliate link to grow your team.</p>';
    return;
  }

  const rows = members.map((m) => `
    <tr>
      <td>
        <div class="cell-user">
          <span class="cell-avatar" aria-hidden="true">${escapeHtml(initialsOf(m.name))}</span>
          <div>
            <strong>${escapeHtml(m.name)}</strong>
            <small>${escapeHtml(m.referCode || '')}</small>
          </div>
        </div>
      </td>
      <td class="cell-mono">${escapeHtml(m.email || '\u2014')}</td>
      <td>${m.package ? escapeHtml(m.package) : '<span class="muted-cell">No package yet</span>'}</td>
      <td><span class="status-pill ${m.status === 'active' ? 'approved' : 'rejected'}">${escapeHtml(m.status)}</span></td>
      <td>${formatDate(m.joinedAt)}</td>
      <td class="cell-mono">${escapeHtml(m.phone || '\u2014')}</td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <div class="table-scroll"><table class="data-table report-table">
      <thead><tr>
        <th>Name</th><th>Email</th><th>Package</th><th>Status</th><th>Joining date</th><th>Phone number</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  `;
}

function formatDate(value) {
  if (!value) return '\u2014';
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
