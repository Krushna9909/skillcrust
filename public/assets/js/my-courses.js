/**
 * public/assets/js/my-courses.js
 *
 * my-courses.html only — wired to Checkpoint 7's `GET /user/my-courses`
 * for the owned-course list, and Checkpoint 6's `GET /courses/:id/
 * lectures` for each course's lecture list. spec1.md's My Courses page
 * literally asks for "video lecture links to be wired in once admin adds
 * content" — this page does exactly that: each course card has a
 * "View lectures" toggle that lazily fetches (and caches) that course's
 * lecture list on first expand, rather than fetching lectures for every
 * owned course up front.
 */

const lectureCache = {};

document.addEventListener('DOMContentLoaded', async () => {
  const profile = await initAppShell();
  if (!profile) return;

  await loadCourses();
});

async function loadCourses() {
  const container = document.getElementById('coursesContainer');
  container.innerHTML = `<div class="grid">${window.skeleton(3, 'card')}</div>`;
  const result = await apiRequest('/user/my-courses');

  if (!result.ok) {
    container.innerHTML = window.errorState('Could not load your courses.', 'Retry');
    const retry = container.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', () => loadCourses());
    return;
  }

  const courses = result.data.courses;
  if (!courses || courses.length === 0) {
    container.innerHTML = '<p class="empty-state">You don\u2019t own any courses yet. <a href="/upgrade.html">Browse courses</a>.</p>';
    return;
  }

  container.innerHTML = `<div class="grid">${courses.map((c, i) => courseCardHtml(c, i)).join('')}</div>`;

  courses.forEach((course) => {
    const toggleBtn = document.getElementById(`lectureToggle${course.id}`);
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => toggleLectures(course.id));
    }
  });
}

function courseCardHtml(course, index) {
  const copy = (window.courseCopy && window.courseCopy(course.name)) || {};
  const art = window.courseArt ? window.courseArt(course) : (window.courseImage ? window.courseImage(course.name) : '');
  return `
    <div class="course-card reveal-left is-visible" style="--reveal-delay:${(Number(index) || 0) * 0.09}s">
      ${art ? `<span class="course-media">
        ${copy.level ? `<span class="level-badge">${escapeHtml(copy.level)}</span>` : ''}
        <img src="${art}" alt="${escapeHtml(course.name)} course artwork" width="1024" height="640" loading="lazy" onerror="this.onerror=null; this.src='/assets/img/course-skills.jpg';">
      </span>` : ''}
      <div class="course-body">
        <span class="badge badge-success">Owned</span>
        <h3>${escapeHtml(course.name)}</h3>
        <p class="desc">${escapeHtml(copy.tagline || course.description || '')}</p>
        <div class="course-price mono">${formatRupees(course.price)}</div>
        <div class="lecture-toggle">
          <button class="btn btn-ghost" type="button" id="lectureToggle${course.id}" data-expanded="false">View lectures</button>
        </div>
        <div id="lectureList${course.id}"></div>
      </div>
    </div>
  `;
}

async function toggleLectures(courseId) {
  const button = document.getElementById(`lectureToggle${courseId}`);
  const listEl = document.getElementById(`lectureList${courseId}`);
  const isExpanded = button.dataset.expanded === 'true';

  if (isExpanded) {
    listEl.innerHTML = '';
    button.textContent = 'View lectures';
    button.dataset.expanded = 'false';
    return;
  }

  button.textContent = 'Loading lectures\u2026';

  if (!lectureCache[courseId]) {
    const result = await apiRequest(`/courses/${courseId}/lectures`);
    if (!result.ok) {
      listEl.innerHTML = '<p class="empty-state">Could not load lectures for this course.</p>';
      button.textContent = 'View lectures';
      return;
    }
    lectureCache[courseId] = result.data.lectures;
  }

  const lectures = lectureCache[courseId];
  listEl.innerHTML = lectures.length === 0
    ? '<p class="empty-state">No lectures have been added for this course yet.</p>'
    : `<ul class="lecture-list">${lectures.map((l, i) => `
        <li>
          <span class="lecture-title"><span class="lecture-num">${String(i + 1).padStart(2, '0')}</span>${escapeHtml(l.title)}</span>
          <a href="${escapeHtml(l.videoLink)}" target="_blank" rel="noopener noreferrer">Watch \u2197</a>
        </li>
      `).join('')}</ul>`;

  button.textContent = 'Hide lectures';
  button.dataset.expanded = 'true';
}

function formatRupees(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '\u20B9\u2014';
  return '\u20B9' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
