/**
 * public/assets/js/main.js
 *
 * Shared across every public page: mobile nav toggle, scroll-reveal
 * (IntersectionObserver, respects prefers-reduced-motion by just showing
 * everything immediately), footer year, and — on pages that have it —
 * hero stat count-ups, and the courses dropdown.
 *
 * Deliberately vanilla JS, no framework/bundler — see README.md's
 * "Frontend tooling decision" section for the full reasoning (Checkpoint
 * 10 made this call; none was locked in earlier).
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavToggle();
  initStickyHeader();
  initScrollReveal();
  initFooterYear();
  initHeroStats();
  initCourseDropdown();
  initRoadmap();
  initCardTilt();
  initLogoSplash();
});

// Re-run reveal observation after async content (course grids) renders.
window.initReveal = initScrollReveal;

function initNavToggle() {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    const isOpen = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
}

/**
 * Adds a hairline + shadow to the sticky header once the page scrolls, so
 * it separates from content without being a permanent heavy bar.
 */
function initStickyHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const update = () => header.classList.toggle('is-stuck', window.scrollY > 8);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

function initScrollReveal() {
  const targets = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-zoom');
  if (targets.length === 0) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  targets.forEach((el) => observer.observe(el));
}

function initFooterYear() {
  const el = document.querySelector('[data-year]');
  if (el) el.textContent = String(new Date().getFullYear());
}

/**
 * Landing hero stat strip — animates any [data-count] element into place
 * once. These are marketing figures in the markup, not API data; the live
 * course count is filled in by courses-preview.js from the real API.
 */
function initHeroStats() {
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.getAttribute('data-count'));
    if (!Number.isFinite(target)) return;
    const decimals = Number(el.getAttribute('data-decimals') || 0);
    const format = (n) => (decimals
      ? n.toFixed(decimals)
      : Math.round(n).toLocaleString('en-IN') + (target >= 1000 ? '+' : ''));
    if (window.countUp) window.countUp(el, target, format);
    else el.textContent = format(target);
  });
}

/**
 * Courses dropdown: click-to-open on every device (no hover opening).
 * Clicking the "Courses" nav item toggles the panel; clicking a course
 * inside goes straight to that course's detail + purchase page.
 */
function initCourseDropdown() {
  const parent = document.querySelector('.has-dropdown');
  if (!parent) return;
  const trigger = parent.querySelector('a');
  if (!trigger) return;

  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');

  const close = () => {
    parent.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
  };

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    const open = !parent.classList.contains('is-open');
    parent.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', (e) => {
    if (!parent.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  hydrateCourseDropdown(parent);
}

/**
 * Fills the dropdown with the live course list so each entry links to
 * /course-detail.html?id=<real id> (detail + purchase page). Falls back
 * silently to the static markup if the API isn't reachable.
 */
async function hydrateCourseDropdown(parent) {
  const panel = parent.querySelector('.dropdown-panel');
  if (!panel || typeof window.apiRequest !== 'function') return;

  const result = await window.apiRequest('/courses');
  if (!result || !result.ok || !result.data || !Array.isArray(result.data.courses)) return;
  const courses = result.data.courses;
  if (courses.length === 0) return;

  const esc = window.escapeHtml || ((s) => String(s));
  const money = window.formatRupees || ((n) => '\u20b9' + n);
  panel.innerHTML =
    courses.map((c) =>
      `<a href="/course-detail.html?id=${encodeURIComponent(c.id)}">${esc(c.name)}<span class="price">${money(c.price)}</span></a>`
    ).join('') +
    '<a href="/courses.html" class="all">View all courses \u2192</a>';
}


/**
 * SuccessRich logo intro. Shows a short animated logo curtain the first
 * time a visitor lands on (or navigates home to) the site in this browsing
 * session — never on every route change, so it stays premium and not
 * annoying. Purely presentational.
 */
function initLogoSplash() {
  if (!document.body && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogoSplash, { once: true });
    return;
  }
  const isHome = /(^\/$|\/index\.html$)/.test(window.location.pathname);
  if (!isHome) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try { if (sessionStorage.getItem('sc-splash') === '1') return; sessionStorage.setItem('sc-splash', '1'); } catch (e) { /* ignore */ }

  const el = document.createElement('div');
  el.className = 'logo-splash';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<div class="splash-inner">' +
    '<span class="splash-ring"></span>' +
    window.logoMarkSvg() +
    '<div class="splash-word">Success<span>Rich</span></div>' +
    '<div class="splash-tag">Educate \u00b7 Grow \u00b7 Prosper</div>' +
    '<div class="splash-bar"><i></i></div>' +
    '</div>';
  document.body.appendChild(el);
  document.body.classList.add('is-splashing');
  setTimeout(() => {
    el.remove();
    document.body.classList.remove('is-splashing');
    document.body.classList.add('splash-done');
  }, 5300);
}

/** Draws the connecting line across the how-it-works roadmap on scroll. */
function initRoadmap() {
  const map = document.querySelector('.roadmap');
  if (!map) return;
  if (!('IntersectionObserver' in window)) { map.classList.add('is-drawn'); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { map.classList.add('is-drawn'); io.disconnect(); }
    });
  }, { threshold: 0.3 });
  io.observe(map);
}

/** Subtle pointer-follow tilt + glow on course cards (desktop only). */
function initCardTilt() {
  if (window.matchMedia('(hover: none)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.addEventListener('pointermove', (event) => {
    const card = event.target.closest && event.target.closest('.course-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `translateY(-10px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)`;
  });
  document.addEventListener('pointerout', (event) => {
    const card = event.target.closest && event.target.closest('.course-card');
    if (card) card.style.transform = '';
  });
}

/**
 * Inline SVG logo mark — SuccessRich: an open book of knowledge with a
 * growth chart, rising arrow and star. Keeps the .lm-layer-1/2/3 and
 * .lm-spark class names so the existing splash animation keeps working.
 */
window.logoMarkSvg = window.logoMarkSvg || function () {
  return (
    '<svg class="logo-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">' +
    '<defs>' +
    '<linearGradient id="srBlue" x1="0" y1="1" x2="1" y2="0">' +
    '<stop offset="0%" stop-color="#6D28D9"/><stop offset="100%" stop-color="#A855F7"/></linearGradient>' +
    '<linearGradient id="srGold" x1="0" y1="1" x2="1" y2="0">' +
    '<stop offset="0%" stop-color="#22D3EE"/><stop offset="100%" stop-color="#67E8F9"/></linearGradient>' +
    '<linearGradient id="srRing" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#A855F7"/><stop offset="100%" stop-color="#22D3EE"/></linearGradient>' +
    '</defs>' +
    // outer badge ring
    '<g class="lm-layer lm-layer-1">' +
    '<circle cx="24" cy="24" r="21" stroke="url(#srRing)" stroke-width="2.4" opacity=".55"/>' +
    '<circle cx="24" cy="24" r="17.2" fill="url(#srBlue)" opacity=".14"/>' +
    '</g>' +
    // S + R monogram
    '<g class="lm-layer lm-layer-2">' +
    '<path d="M23.4 18.4c-.6-1.5-2.1-2.4-4-2.4-2.4 0-4 1.3-4 3.1 0 1.7 1.3 2.6 3.9 3.2 3.3.8 5 2.3 5 5 0 3.1-2.6 5.2-6.3 5.2-3.2 0-5.6-1.5-6.4-4"' +
    ' stroke="url(#srGold)" stroke-width="2.8" stroke-linecap="round" fill="none"/>' +
    '<path d="M26.6 32.4V16h5.1c2.9 0 4.8 1.7 4.8 4.4 0 2.6-1.9 4.3-4.8 4.3h-5.1M31.4 24.8l5.3 7.6"' +
    ' stroke="url(#srBlue)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
    '</g>' +
    // graduation cap + rupee accent
    '<g class="lm-layer lm-layer-3">' +
    '<path d="M24 3.6 38 9.2 24 14.8 10 9.2z" fill="url(#srGold)"/>' +
    '<path d="M15.5 11.6v4.1c0 1.9 3.8 3.2 8.5 3.2s8.5-1.3 8.5-3.2v-4.1" stroke="url(#srBlue)" stroke-width="2" stroke-linecap="round" fill="none" opacity=".85"/>' +
    '<path d="M38 9.6v6.2" stroke="url(#srGold)" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M36.6 38.2h6M36.6 41h6M38.2 38.2c2.4 0 3.6 1 3.6 2.6 0 1.7-1.2 2.7-3.6 2.7h-1.6l4.6 4.3" stroke="url(#srGold)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".9"/>' +
    '</g>' +
    '<path class="lm-spark" d="M42.4 4.2l1.3 2.9 3.2.3-2.4 2.1.7 3.1-2.8-1.6-2.8 1.6.7-3.1-2.4-2.1 3.2-.3z" fill="url(#srGold)"/>' +
    '</svg>'
  );
};

/** Injects the logo mark into every .brand link that asks for it. */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.brand[data-logo]:not([data-logo-ready])').forEach((el) => {
    el.setAttribute('data-logo-ready', '1');
    el.insertAdjacentHTML('afterbegin', window.logoMarkSvg());
  });
});
