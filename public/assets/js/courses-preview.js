/**
 * public/assets/js/courses-preview.js
 *
 * Landing page only — fetches GET /api/v1/courses (Checkpoint 10) and
 * renders the first 3 as a teaser grid, linking each to its full detail
 * page. The full 6-course grid lives on courses.html (courses.js).
 *
 * Public pages are skill-focused: referral/commission figures are NOT
 * shown here (they stay inside the authenticated dashboard). Marketing
 * copy comes from course-copy.js, matched by course name; price, id and
 * name always come from the API.
 */

(async function loadCoursePreview() {
  const grid = document.getElementById('coursePreviewGrid');
  if (!grid) return;

  const result = await apiRequest('/courses');

  if (!result.ok || !result.data || !Array.isArray(result.data.courses)) {
    grid.innerHTML = window.errorState('Courses are temporarily unavailable — please check back shortly.');
    return;
  }

  // Real count from the API — never a hard-coded marketing number.
  const countEl = document.getElementById('heroCourseCount');
  if (countEl) window.countUp(countEl, result.data.courses.length, (n) => String(Math.round(n)));

  const courses = result.data.courses.slice(0, 3);
  if (courses.length === 0) {
    grid.innerHTML = '<p class="empty-state">No courses are available right now.</p>';
    return;
  }

  grid.innerHTML = courses.map(window.courseCardHtml).join('');
  if (window.initReveal) window.initReveal();
})();

/** Shared by courses-preview.js and courses.js so both grids stay identical. */
window.courseCardHtml = function (course, index) {
  const copy = window.courseCopy(course.name) || {};
  const pills = (copy.skills || []).slice(0, 4)
    .map((s) => `<span>${window.escapeHtml(s)}</span>`).join('');
  const tagline = copy.tagline || course.description || '';

  return `
    <a href="/course-detail.html?id=${encodeURIComponent(course.id)}" class="card glass course-card reveal-left" style="--reveal-delay:${(Number(index) || 0) * 0.12}s">
      <span class="course-media">
        ${copy.level ? `<span class="level-badge">${window.escapeHtml(copy.level)}</span>` : ''}
        <img src="${window.courseImage(course.name)}" alt="${window.escapeHtml(course.name)} course artwork" width="1024" height="640" loading="lazy">
      </span>
      <span class="course-body">
        <h3>${window.escapeHtml(course.name)}</h3>
        <p class="desc">${window.escapeHtml(tagline)}</p>
        ${pills ? `<div class="skill-pills">${pills}</div>` : ''}
        <div class="course-price">${window.formatRupees(course.price)}</div>
        <span class="card-cta">View curriculum →</span>
      </span>
    </a>
  `;
};
