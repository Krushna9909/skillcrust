/**
 * public/assets/js/admin-courses.js
 *
 * admin-courses.html only — wired to Checkpoint 8's course CRUD
 * (`GET/POST /admin/courses`, `PATCH /admin/courses/:id`) and Checkpoint
 * 6/12b's lecture management (`GET/POST /admin/courses/:id/lectures`,
 * `PATCH .../lectures/:lectureId`, `PUT .../lectures/reorder`).
 *
 * *** REORDERING — up/down buttons, not drag-and-drop ***
 * `PUT .../lectures/reorder` expects the full, exact set of lecture ids
 * in their new order (`{ lectureIds: [...] }` — see admin.controller.js's
 * `reorderLectures` for why it validates the submitted set matches the
 * course's current lectures exactly). Up/down buttons that swap two
 * adjacent ids client-side, then submit the whole array, satisfy that
 * exactly and are far more reliably verifiable without a real browser/
 * mouse than implementing HTML5 drag-and-drop — a deliberate simplicity
 * choice, not a spec requirement either way (spec1.md just says
 * "reorder," not how).
 */

let coursesData = [];
const lectureCache = {};

document.addEventListener('DOMContentLoaded', async () => {
  const admin = await initAdminShell();
  if (!admin) return;

  await loadCourses();
  wireAddCourseForm();
});

async function loadCourses() {
  const container = document.getElementById('coursesContainer');
  const result = await apiRequest('/admin/courses');

  if (!result.ok) {
    container.innerHTML = '<div class="alert alert-error">Could not load courses. Please refresh the page.</div>';
    return;
  }

  coursesData = result.data.courses;
  container.innerHTML = coursesData.map(courseCardHtml).join('');

  coursesData.forEach((course) => {
    document.getElementById(`courseRow${course.id}`).addEventListener('click', () => toggleCourse(course.id));
    document.getElementById(`editCourseForm${course.id}`).addEventListener('submit', (e) => submitEditCourse(e, course.id));
    document.getElementById(`addLectureForm${course.id}`).addEventListener('submit', (e) => submitAddLecture(e, course.id));
    document.getElementById(`thumbInput${course.id}`).addEventListener('change', (e) => uploadThumbnail(course.id, e.target));
  });

  container.querySelectorAll('[data-delete-course]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteCourse(Number(btn.dataset.deleteCourse));
    });
  });
}

function courseCardHtml(course) {
  return `
    <div class="card admin-course-card" id="courseCard${course.id}">
      <div class="course-row" id="courseRow${course.id}">
        <h3>${escapeHtml(course.name)} ${course.isActive ? '' : '<span class="badge" style="color:var(--danger); border-color:var(--danger); background:transparent;">INACTIVE</span>'}</h3>
        <div class="course-row-meta">
          <span class="mono">${formatRupees(course.price)}</span>
          <span class="mono" style="color:var(--money-hover);">+${formatRupees(course.directBonus)} direct</span>
        </div>
      </div>
      <div class="course-detail" id="courseDetail${course.id}">
        <h4 style="font-size:0.95rem; margin-bottom:12px;">Edit course</h4>
        <div id="editCourseMessage${course.id}" class="form-message" role="alert"></div>
        <form id="editCourseForm${course.id}" novalidate>
          <div class="field-row">
            <div class="field"><label>Name</label><input type="text" id="editName${course.id}" value="${escapeAttr(course.name)}" required></div>
            <div class="field"><label>Description</label><input type="text" id="editDescription${course.id}" value="${escapeAttr(course.description || '')}" required></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Price (₹)</label><input type="number" id="editPrice${course.id}" value="${course.price}" min="0" step="1" required></div>
            <div class="field"><label>Direct bonus (₹)</label><input type="number" id="editDirectBonus${course.id}" value="${course.directBonus}" min="0" step="1" required></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Indirect bonus (₹)</label><input type="number" id="editIndirectBonus${course.id}" value="${course.indirectBonus}" min="0" step="1" required></div>
            <div class="field"><label>Company cut (₹)</label><input type="number" id="editCompanyCut${course.id}" value="${course.companyCut}" min="0" step="1" required></div>
          </div>
          <div class="checkbox-field">
            <input type="checkbox" id="editActive${course.id}" ${course.isActive ? 'checked' : ''}>
            <label for="editActive${course.id}">Active (visible for purchase)</label>
          </div>
          <button type="submit" class="btn btn-primary" style="padding:9px 18px; font-size:0.85rem;">Save course</button>
        </form>

        <div class="thumb-block">
          <div class="thumb-preview">
            <img id="thumbPreview${course.id}" src="${escapeAttr(courseThumbSrc(course))}" alt="${escapeAttr(course.name)} thumbnail">
          </div>
          <div class="thumb-actions">
            <h4>Course thumbnail</h4>
            <p class="thumb-note">Upload any image — no size limit. Shown on the courses page and course cards.</p>
            <label class="btn btn-ghost thumb-btn" for="thumbInput${course.id}">Upload thumbnail</label>
            <input type="file" id="thumbInput${course.id}" accept="image/*" hidden>
            <div id="thumbMessage${course.id}" class="form-message" role="alert"></div>
          </div>
        </div>

        <div class="danger-zone">
          <div>
            <h4>Delete course</h4>
            <p class="thumb-note">Permanently removes this course and its lectures. This cannot be undone.</p>
          </div>
          <button type="button" class="btn btn-danger" data-delete-course="${course.id}">Delete course</button>
        </div>

        <h4 style="font-size:0.95rem; margin:26px 0 12px;">Lectures</h4>
        <div id="lectureListWrap${course.id}"><p class="empty-state" style="padding:10px 0;">Loading&hellip;</p></div>

        <h4 style="font-size:0.9rem; margin:20px 0 10px; color:var(--text-muted);">Add a lecture</h4>
        <div id="addLectureMessage${course.id}" class="form-message" role="alert"></div>
        <form id="addLectureForm${course.id}" novalidate>
          <div class="field-row">
            <div class="field"><label>Title</label><input type="text" id="newLectureTitle${course.id}" required></div>
            <div class="field"><label>Video link</label><input type="url" id="newLectureLink${course.id}" required placeholder="https://..."></div>
          </div>
          <div class="field"><label>Description (optional)</label><input type="text" id="newLectureDescription${course.id}"></div>
          <button type="submit" class="btn btn-ghost" style="padding:9px 18px; font-size:0.85rem;">Add lecture</button>
        </form>
      </div>
    </div>
  `;
}

async function toggleCourse(courseId) {
  const card = document.getElementById(`courseCard${courseId}`);
  const isExpanded = card.classList.contains('is-expanded');

  if (isExpanded) {
    card.classList.remove('is-expanded');
    return;
  }
  card.classList.add('is-expanded');

  if (!lectureCache[courseId]) {
    await loadLectures(courseId);
  }
}

async function loadLectures(courseId) {
  const wrap = document.getElementById(`lectureListWrap${courseId}`);
  const result = await apiRequest(`/admin/courses/${courseId}/lectures`);

  if (!result.ok) {
    wrap.innerHTML = '<p class="empty-state" style="padding:10px 0;">Could not load lectures.</p>';
    return;
  }

  lectureCache[courseId] = result.data.lectures;
  renderLectures(courseId);
}

function renderLectures(courseId) {
  const wrap = document.getElementById(`lectureListWrap${courseId}`);
  const lectures = lectureCache[courseId];

  if (lectures.length === 0) {
    wrap.innerHTML = '<p class="empty-state" style="padding:10px 0;">No lectures yet.</p>';
    return;
  }

  wrap.innerHTML = lectures.map((l, i) => `
    <div class="lecture-row">
      <span class="lecture-row-title"><span class="lecture-num">${String(i + 1).padStart(2, '0')}</span>${escapeHtml(l.title)}</span>
      <button class="btn btn-ghost" style="padding:4px 10px; font-size:0.78rem;" data-move="up" data-course="${courseId}" data-index="${i}" ${i === 0 ? 'disabled' : ''}>\u2191</button>
      <button class="btn btn-ghost" style="padding:4px 10px; font-size:0.78rem;" data-move="down" data-course="${courseId}" data-index="${i}" ${i === lectures.length - 1 ? 'disabled' : ''}>\u2193</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-move]').forEach((btn) => {
    btn.addEventListener('click', () => moveLecture(Number(btn.dataset.course), Number(btn.dataset.index), btn.dataset.move));
  });
}

async function moveLecture(courseId, index, direction) {
  const lectures = lectureCache[courseId];
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= lectures.length) return;

  [lectures[index], lectures[targetIndex]] = [lectures[targetIndex], lectures[index]];
  renderLectures(courseId); // optimistic reorder, reconciled below

  const result = await apiRequest(`/admin/courses/${courseId}/lectures/reorder`, {
    method: 'PUT',
    body: { lectureIds: lectures.map((l) => l.id) },
  });

  if (result.ok) {
    lectureCache[courseId] = result.data.lectures;
  } else {
    // Reorder rejected server-side — reload the real state rather than
    // trust the optimistic client-side swap.
    await loadLectures(courseId);
  }
  renderLectures(courseId);
}

async function submitEditCourse(event, courseId) {
  event.preventDefault();
  const messageEl = document.getElementById(`editCourseMessage${courseId}`);
  messageEl.className = 'form-message';

  const payload = {
    name: document.getElementById(`editName${courseId}`).value.trim(),
    description: document.getElementById(`editDescription${courseId}`).value.trim(),
    price: Number(document.getElementById(`editPrice${courseId}`).value),
    directBonus: Number(document.getElementById(`editDirectBonus${courseId}`).value),
    indirectBonus: Number(document.getElementById(`editIndirectBonus${courseId}`).value),
    companyCut: Number(document.getElementById(`editCompanyCut${courseId}`).value),
    isActive: document.getElementById(`editActive${courseId}`).checked,
  };

  const result = await apiRequest(`/admin/courses/${courseId}`, { method: 'PATCH', body: payload });

  if (!result.ok) {
    messageEl.textContent = apiErrorMessage(result, 'Could not save this course.');
    messageEl.className = 'form-message is-error';
    return;
  }

  messageEl.textContent = 'Saved.';
  messageEl.className = 'form-message is-success';
  await loadCourses(); // refresh summary row (name/price/active badge) too
  document.getElementById(`courseCard${courseId}`).classList.add('is-expanded');
}

async function submitAddLecture(event, courseId) {
  event.preventDefault();
  const messageEl = document.getElementById(`addLectureMessage${courseId}`);
  messageEl.className = 'form-message';

  const payload = {
    title: document.getElementById(`newLectureTitle${courseId}`).value.trim(),
    videoLink: document.getElementById(`newLectureLink${courseId}`).value.trim(),
  };
  const description = document.getElementById(`newLectureDescription${courseId}`).value.trim();
  if (description) payload.description = description;

  const result = await apiRequest(`/admin/courses/${courseId}/lectures`, { method: 'POST', body: payload });

  if (!result.ok) {
    messageEl.textContent = apiErrorMessage(result, 'Could not add this lecture.');
    messageEl.className = 'form-message is-error';
    return;
  }

  messageEl.textContent = 'Lecture added.';
  messageEl.className = 'form-message is-success';
  document.getElementById(`addLectureForm${courseId}`).reset();
  await loadLectures(courseId);
}

function wireAddCourseForm() {
  const toggleBtn = document.getElementById('toggleAddFormBtn');
  const cancelBtn = document.getElementById('cancelAddCourseBtn');
  const card = document.getElementById('addCourseCard');
  const form = document.getElementById('addCourseForm');
  const messageEl = document.getElementById('addCourseMessage');
  const submitBtn = document.getElementById('addCourseSubmitBtn');

  const newThumbInput = document.getElementById('newThumbnail');
  if (newThumbInput) {
    newThumbInput.addEventListener('change', () => {
      const f = newThumbInput.files && newThumbInput.files[0];
      document.getElementById('newThumbName').textContent = f ? f.name : 'No file chosen';
    });
  }

  toggleBtn.addEventListener('click', () => {
    card.style.display = card.style.display === 'none' ? 'block' : 'none';
  });
  cancelBtn.addEventListener('click', () => {
    card.style.display = 'none';
    form.reset();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageEl.className = 'form-message';

    const payload = {
      name: document.getElementById('newName').value.trim(),
      description: document.getElementById('newDescription').value.trim(),
      price: Number(document.getElementById('newPrice').value),
      directBonus: Number(document.getElementById('newDirectBonus').value),
      indirectBonus: Number(document.getElementById('newIndirectBonus').value),
      companyCut: Number(document.getElementById('newCompanyCut').value),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating\u2026';
    const result = await apiRequest('/admin/courses', { method: 'POST', body: payload });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create course';

    if (!result.ok) {
      messageEl.textContent = apiErrorMessage(result, 'Could not create this course.');
      messageEl.className = 'form-message is-error';
      return;
    }

    const newThumbInput = document.getElementById('newThumbnail');
    const createdId = result.data && result.data.course && result.data.course.id;
    if (createdId && newThumbInput && newThumbInput.files && newThumbInput.files[0]) {
      const fd = new FormData();
      fd.append('thumbnail', newThumbInput.files[0]);
      await fetch(`/api/v1/admin/courses/${createdId}/thumbnail`, { method: 'POST', credentials: 'include', body: fd })
        .catch(() => null);
    }

    form.reset();
    document.getElementById('newThumbName').textContent = 'No file chosen';
    card.style.display = 'none';
    await loadCourses();
  });
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}


/* ---------------------------------------------------------------------------
 * Thumbnails + delete (admin only)
 * ------------------------------------------------------------------------- */

function courseThumbSrc(course) {
  if (course.thumbnailUrl || course.thumbnail_url) return course.thumbnailUrl || course.thumbnail_url;
  if (window.courseImage) return window.courseImage(course.name);
  return '/assets/img/course-skills.jpg';
}

async function uploadThumbnail(courseId, input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const messageEl = document.getElementById(`thumbMessage${courseId}`);
  messageEl.textContent = 'Uploading\u2026';
  messageEl.className = 'form-message';

  // Instant local preview so the admin sees the crop right away.
  const localUrl = URL.createObjectURL(file);
  document.getElementById(`thumbPreview${courseId}`).src = localUrl;

  const formData = new FormData();
  formData.append('thumbnail', file);

  try {
    const response = await fetch(`/api/v1/admin/courses/${courseId}/thumbnail`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      messageEl.textContent = (data && data.error && data.error.message) || 'Could not upload this thumbnail.';
      messageEl.className = 'form-message is-error';
      input.value = '';
      return;
    }

    const url = (data && (data.thumbnailUrl || data.thumbnail_url)) || '';
    if (url) document.getElementById(`thumbPreview${courseId}`).src = url;
    messageEl.textContent = 'Thumbnail updated.';
    messageEl.className = 'form-message is-success';
    if (window.toast) window.toast('Thumbnail updated.', 'success');
  } catch (err) {
    messageEl.textContent = 'Could not upload this thumbnail \u2014 please try again.';
    messageEl.className = 'form-message is-error';
  }
  input.value = '';
}

async function deleteCourse(courseId) {
  const course = coursesData.find((c) => c.id === courseId);
  const name = course ? course.name : 'this course';
  if (!window.confirm(`Delete "${name}"? This removes the course and its lectures permanently.`)) return;

  const btn = document.querySelector(`[data-delete-course="${courseId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting\u2026'; }

  const restore = () => { if (btn) { btn.disabled = false; btn.textContent = 'Delete course'; } };

  // 1) Preferred: real DELETE endpoint.
  let result = await apiRequest(`/admin/courses/${courseId}`, { method: 'DELETE' });

  // 2) Some deployments expose the destructive action as a POST action
  //    instead of DELETE (proxies/hosts that strip DELETE). Try that next.
  if (!result.ok && (result.status === 404 || result.status === 405 || result.status === 501)) {
    result = await apiRequest(`/admin/courses/${courseId}/delete`, { method: 'POST' });
  }

  // 3) Last resort: deactivate so the course disappears from the storefront
  //    even when the backend has no delete route at all.
  let deactivatedOnly = false;
  if (!result.ok && (result.status === 404 || result.status === 405 || result.status === 501)) {
    const payload = {
      name: course.name,
      description: course.description || '',
      price: course.price,
      directBonus: course.directBonus,
      indirectBonus: course.indirectBonus,
      companyCut: course.companyCut,
      isActive: false,
    };
    result = await apiRequest(`/admin/courses/${courseId}`, { method: 'PATCH', body: payload });
    deactivatedOnly = result.ok;
  }

  if (!result.ok) {
    restore();
    const message = apiErrorMessage(result, 'Could not delete this course.');
    if (window.toast) window.toast(message, 'error');
    else window.alert(message);
    return;
  }

  const msg = deactivatedOnly
    ? 'Course removed from the storefront (deactivated).'
    : 'Course deleted.';
  if (window.toast) window.toast(msg, 'success');
  delete lectureCache[courseId];
  const card = document.getElementById(`courseCard${courseId}`);
  if (card) card.remove();
  coursesData = coursesData.filter((c) => c.id !== courseId);
  await loadCourses();
}
