/**
 * public/assets/js/upgrade.js
 *
 * upgrade.html only — wired to Checkpoint 7's `GET /user/upgrade` (list)
 * and Checkpoint 3's `POST /user/purchase` (the REAL purchase endpoint —
 * no `simulate` field is ever sent from this page; that parameter is a
 * dev/test-only backend feature, not something a real "Buy" button should
 * ever expose, and it's silently ignored in production anyway per
 * mockGateway.js's `sanitizeSimulateOverride`).
 */

document.addEventListener('DOMContentLoaded', async () => {
  const profile = await initAppShell();
  if (!profile) return;

  await loadUpgradeOptions();
});

async function loadUpgradeOptions() {
  const container = document.getElementById('upgradeContainer');
  container.innerHTML = `<div class="grid">${window.skeleton(3, 'card')}</div>`;
  const result = await apiRequest('/user/upgrade');

  if (!result.ok) {
    container.innerHTML = window.errorState('Could not load available courses.', 'Retry');
    const retry = container.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', () => loadUpgradeOptions());
    return;
  }

  const courses = result.data.courses;
  if (!courses || courses.length === 0) {
    container.innerHTML = '<p class="empty-state">You already own every course we offer \u2014 nice.</p>';
    return;
  }

  container.innerHTML = `<div class="grid">${courses.map((c, i) => courseCardHtml(c, i)).join('')}</div>`;

  courses.forEach((course) => {
    const btn = document.getElementById(`buyBtn${course.id}`);
    if (btn) btn.addEventListener('click', () => buyCourse(course));
  });
}

function courseCardHtml(course, index) {
  const copy = (window.courseCopy && window.courseCopy(course.name)) || {};
  const art = window.courseImage ? window.courseImage(course.name) : '';
  return `
    <div class="course-card is-offer reveal-left is-visible" style="--reveal-delay:${(Number(index) || 0) * 0.09}s">
      ${art ? `<span class="course-media">
        ${copy.level ? `<span class="level-badge">${escapeHtml(copy.level)}</span>` : ''}
        <img src="${art}" alt="${escapeHtml(course.name)} course artwork" width="1024" height="640" loading="lazy">
      </span>` : ''}
      <div class="course-body">
        <h3>${escapeHtml(course.name)}</h3>
        <p class="desc">${escapeHtml(copy.tagline || course.description || '')}</p>
        <div class="course-price mono">${formatRupees(course.price)}</div>
        <span class="badge badge-success">Earn ${formatRupees(course.directBonus)} per direct referral</span>
        <button class="btn btn-primary btn-block" type="button" id="buyBtn${course.id}" style="margin-top:18px;">Buy this course</button>
      </div>
    </div>
  `;
}

async function buyCourse(course) {
  const button = document.getElementById(`buyBtn${course.id}`);
  const messageEl = document.getElementById('upgradeMessage');
  window.setLoading(button, true, 'Processing\u2026');

  const result = await apiRequest('/user/purchase', { method: 'POST', body: { courseId: course.id } });

  if (result.ok) {
    messageEl.innerHTML = `<div class="alert alert-success">You now own ${escapeHtml(course.name)}! Check <a href="/my-courses.html">My Courses</a> or set up your <a href="/affiliate-links.html">affiliate link</a> for it.</div>`;
    window.toast(`You now own ${course.name}`, 'success');
    await loadUpgradeOptions(); // refresh — the purchased course drops out of the unowned list
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // A well-formed decline (402, purchase.status === 'failed') vs. a
  // genuine request error (400/409/etc.) both land here — either way,
  // the course stays in the list so the person can just try again.
  const reason = (result.data && result.data.purchase && result.data.purchase.failureReason)
    || apiErrorMessage(result, 'Purchase could not be completed.');
  messageEl.innerHTML = `<div class="alert alert-error">${escapeHtml(reason)} Please try again.</div>`;
  window.setLoading(button, false);
  window.toast(reason, 'error');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function formatRupees(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '\u20B9\u2014';
  return '\u20B9' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
