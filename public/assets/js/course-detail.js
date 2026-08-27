/**
 * public/assets/js/course-detail.js
 *
 * course-detail.html only — reads `?id=` from the URL, fetches
 * GET /api/v1/courses/:id (Checkpoint 10), and renders the detail view.
 * The "Enroll" CTA links to `/signup.html?courseId=<id>`, pre-selecting
 * this course on the signup form (see signup.js).
 *
 * Curriculum / FAQ / "what's next" copy is presentational and comes from
 * course-copy.js; name, price and id always come from the API.
 */

(async function loadCourseDetail() {
  const container = document.getElementById('courseDetailContainer');
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const courseId = params.get('id');
  if (!courseId) {
    container.innerHTML = notFoundHtml();
    return;
  }

  const result = await apiRequest(`/courses/${encodeURIComponent(courseId)}`);
  if (!result.ok || !result.data || !result.data.course) {
    container.innerHTML = notFoundHtml();
    return;
  }

  const course = result.data.course;
  document.title = `${course.name} — SuccessRich`;
  container.innerHTML = detailHtml(course);
  if (window.initReveal) window.initReveal();
}());

function detailHtml(course) {
  const esc = window.escapeHtml;
  const copy = window.courseCopy(course.name) || {};
  const modules = (copy.curriculum || []).map(([title, body], i) => `
    <div class="module glass reveal-left" style="--reveal-delay:${(i % 6) * 0.07}s">
      <span class="num">${String(i + 1).padStart(2, '0')}</span>
      <div><h4>${esc(title)}</h4><p>${esc(body)}</p></div>
    </div>`).join('');
  const faqs = (copy.faqs || []).map(([q, a]) => `
    <details class="faq-item reveal-left"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
  const skills = (copy.skills || []).map((s) => `<li>${esc(s)}</li>`).join('');

  return `
    <div class="detail-head reveal-left">
      <a href="/courses.html" class="back-link">← All courses</a>
      <div class="detail-head-meta">
        ${copy.level ? `<span class="level-badge">${esc(copy.level)}</span>` : ''}
        <span class="detail-chip">Self-paced</span>
        <span class="detail-chip">Lifetime access</span>
      </div>
      <h1>${esc(course.name)}</h1>
      <p class="lede">${esc(copy.tagline || course.description || '')}</p>
      <div class="detail-head-cta">
        <span class="course-price">${window.formatRupees(course.price)}</span>
        <a href="/signup.html?courseId=${encodeURIComponent(course.id)}" class="btn btn-primary">Enroll Now</a>
      </div>
    </div>

    <div class="detail-grid">
      <div>
        ${copy.overview ? `<p>${esc(copy.overview)}</p>` : ''}
        ${copy.audience ? `<p><strong>Who it's for:</strong> ${esc(copy.audience)}</p>` : ''}
        <h2 style="margin-top:34px;">What you'll learn</h2>
        <div class="module-list">${modules || '<p class="empty-state">Curriculum details coming soon.</p>'}</div>
        ${faqs ? `<h2 style="margin-top:38px;">Course FAQs</h2><div class="faq-list">${faqs}</div>` : ''}
        ${copy.next ? `<div class="cta-band glass reveal" style="margin-top:38px;">
          <span class="eyebrow">What's next</span>
          <h3>Ready for ${esc(copy.next[0])}?</h3>
          <p>${esc(copy.next[1].charAt(0).toUpperCase() + copy.next[1].slice(1))}</p>
          <a href="/courses.html" class="btn btn-ghost">Browse the next tier</a>
        </div>` : ''}
      </div>

      <aside class="detail-sidebar reveal-right">
        <div class="card glass detail-buy">
          ${copy.level ? `<span class="level-badge">${esc(copy.level)}</span>` : ''}
          <div class="course-price" style="margin:12px 0 4px;">${window.formatRupees(course.price)}</div>
          <p class="desc">One-time payment · lifetime access</p>
          <a href="/signup.html?courseId=${encodeURIComponent(course.id)}" class="btn btn-primary" style="width:100%; justify-content:center;">Enroll Now</a>
          <a href="/login.html" class="btn btn-ghost" style="width:100%; justify-content:center; margin-top:10px;">Already a member? Log in</a>
        </div>
        ${skills ? `<div class="card glass">
          <h4>Skills included</h4>
          <ul class="included">${skills}</ul>
        </div>` : ''}
        <div class="card glass">
          <h4>What you get</h4>
          <ul class="included">
            <li>Self-paced video lessons</li>
            <li>Lifetime access to updates</li>
            <li>Learn on mobile or desktop</li>
            <li>Learner support</li>
          </ul>
        </div>
      </aside>
    </div>
  `;
}

function notFoundHtml() {
  return `
    <div class="card glass text-center">
      <h1>Course not found</h1>
      <p class="desc">This course may have been removed or the link is incorrect.</p>
      <a href="/courses.html" class="btn btn-primary">Browse all courses</a>
    </div>
  `;
}
