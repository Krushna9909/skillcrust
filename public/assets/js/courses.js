/**
 * public/assets/js/courses.js
 *
 * courses.html — renders the full catalogue from GET /api/v1/courses.
 * Card markup is shared with the landing preview (courseCardHtml in
 * courses-preview.js) so both grids stay visually identical.
 */

(async function loadCourses() {
  const grid = document.getElementById('courseGrid');
  if (!grid) return;

  const result = await apiRequest('/courses');

  if (!result.ok || !result.data || !Array.isArray(result.data.courses)) {
    grid.innerHTML = window.errorState('Courses are temporarily unavailable — please check back shortly.');
    return;
  }

  const courses = result.data.courses;
  if (courses.length === 0) {
    grid.innerHTML = '<p class="empty-state">No courses are available right now.</p>';
    return;
  }

  grid.innerHTML = courses.map(window.courseCardHtml).join('');
  if (window.initReveal) window.initReveal();
})();
