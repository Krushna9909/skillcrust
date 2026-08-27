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
  try {
    if (sessionStorage.getItem('successrich_intro_seen') === '1') return;
    sessionStorage.setItem('successrich_intro_seen', '1');
  } catch (e) { /* ignore */ }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = document.createElement('div');
  el.className = 'sr-intro' + (reduced ? ' is-reduced' : '');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<div class="sr-intro-glow"></div>' +
    '<div class="sr-intro-stage">' +
    '<div class="sr-intro-logo">' +
    '<img src="' + window.SR_LOGO_SRC + '" alt="SuccessRich" decoding="async" />' +
    '<span class="sr-intro-sweep"><i></i></span>' +
    '</div>' +
    '</div>';
  document.body.appendChild(el);
  document.body.classList.add('is-splashing');
  const hold = reduced ? 900 : 4300;
  setTimeout(() => { el.classList.add('is-out'); }, hold);
  setTimeout(() => {
    el.remove();
    document.body.classList.remove('is-splashing');
    document.body.classList.add('splash-done');
  }, hold + 650);
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
window.SR_LOGO_SRC = '/assets/img/successrich-logo.png';
window.SR_LOGO_SM = '/assets/img/successrich-logo-sm.png';

/**
 * Official SuccessRich logo lockup. The artwork is the official brand file —
 * never redrawn, never distorted (object-fit: contain, natural ratio kept).
 */
window.logoMarkSvg = window.logoMarkSvg || function (variant) {
  var src = variant === 'full' ? window.SR_LOGO_SRC : window.SR_LOGO_SM;
  return '<img class="logo-mark logo-official" src="' + src + '" alt="SuccessRich" decoding="async" />';
};

/** Injects the logo mark into every .brand link that asks for it. */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.brand[data-logo]:not([data-logo-ready])').forEach((el) => {
    el.setAttribute('data-logo-ready', '1');
    el.insertAdjacentHTML('afterbegin', window.logoMarkSvg());
  });
});
