/**
 * public/assets/js/courses-preview.js
 *
 * Landing page only — fetches GET /api/v1/courses and renders the first 3
 * as a teaser grid. Clicking "View all courses" expands the same grid to
 * show all 6 courses on the landing page without navigating away.
 *
 * Public pages are skill-focused: referral/commission figures are NOT
 * shown here (they stay inside the authenticated dashboard). Marketing
 * copy comes from course-copy.js, matched by course name; price, id and
 * name always come from the API.
 */

(function loadCoursePreview() {
  const grid = document.getElementById('coursePreviewGrid');
  if (!grid) return;

  // Keep the raw course list so we can expand/collapse on the same grid.
  let allCourses = [];
  let isExpanded = false;

  const toggleBtn = document.getElementById('coursePreviewToggle');

  function renderCourses() {
    if (allCourses.length === 0) {
      grid.innerHTML = '<p class="empty-state">No courses are available right now.</p>';
      if (toggleBtn) toggleBtn.style.display = 'none';
      return;
    }

    const visible = isExpanded ? allCourses : allCourses.slice(0, 3);
    grid.innerHTML = visible.map(window.courseCardHtml).join('');
    if (window.initReveal) window.initReveal();

    // Safety net: if the reveal observer never fires, show the cards anyway.
    setTimeout(() => {
      grid.querySelectorAll('.course-card:not(.is-visible)')
        .forEach((el) => el.classList.add('is-visible'));
    }, 1500);

    if (toggleBtn) {
      toggleBtn.textContent = isExpanded ? 'Show less courses' : 'View all courses';
      toggleBtn.style.display = allCourses.length > 3 ? 'inline-flex' : 'none';
    }
  }

  async function fetchAndRender() {
    const result = await apiRequest('/courses');

    if (!result.ok || !result.data || !Array.isArray(result.data.courses)) {
      grid.innerHTML = window.errorState('Courses are temporarily unavailable — please check back shortly.');
      if (toggleBtn) toggleBtn.style.display = 'none';
      return;
    }

    allCourses = result.data.courses;

    // Real count from the API — never a hard-coded marketing number.
    const countEl = document.getElementById('heroCourseCount');
    if (countEl) window.countUp(countEl, allCourses.length, (n) => String(Math.round(n)));

    renderCourses();
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      isExpanded = !isExpanded;
      renderCourses();
      // Smooth scroll back to the courses section so the user notices the change.
      const section = document.getElementById('courses-preview');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  fetchAndRender();
})();

/** Shared by courses-preview.js and courses.js so both grids stay identical. */
window.courseCardHtml = function (course, index) {
  const copy = window.courseCopy(course.name) || {};
  const pills = (copy.skills || []).slice(0, 4)
    .map((s) => `<span>${window.escapeHtml(s)}</span>`).join('');
  const tagline = copy.tagline || course.description || '';
  const imageUrl = window.courseArt ? window.courseArt(course) : window.courseImage(course.name);

  return `
    <a href="/course-detail.html?id=${encodeURIComponent(course.id)}" class="card glass course-card reveal-left" style="--reveal-delay:${(Number(index) || 0) * 0.12}s">
      <span class="course-media">
        ${copy.level ? `<span class="level-badge">${window.escapeHtml(copy.level)}</span>` : ''}
        <img src="${imageUrl}" alt="${window.escapeHtml(course.name)} course artwork" width="1024" height="640" loading="lazy" onerror="this.onerror=null; this.src='/assets/img/course-skills.jpg'; this.alt='${window.escapeHtml(course.name)} course artwork';">
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
