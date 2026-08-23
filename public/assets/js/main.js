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
 * Courses dropdown: hover/focus is handled in CSS. This only adds
 * keyboard dismissal (Escape) and tap-to-open on touch devices, where
 * :hover never fires.
 */
function initCourseDropdown() {
  const parent = document.querySelector('.has-dropdown');
  if (!parent) return;
  const trigger = parent.querySelector('a');

  trigger.addEventListener('click', (e) => {
    if (!window.matchMedia('(hover: none)').matches) return;
    if (!parent.classList.contains('is-open')) {
      e.preventDefault();
      parent.classList.add('is-open');
    }
  });
  document.addEventListener('click', (e) => {
    if (!parent.contains(e.target)) parent.classList.remove('is-open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') parent.classList.remove('is-open');
  });
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
    '<stop offset="0%" stop-color="#0E3A73"/><stop offset="100%" stop-color="#1E63B8"/></linearGradient>' +
    '<linearGradient id="srGold" x1="0" y1="1" x2="1" y2="0">' +
    '<stop offset="0%" stop-color="#B98E1E"/><stop offset="100%" stop-color="#E8C458"/></linearGradient>' +
    '</defs>' +
    // money bag (back)
    '<g class="lm-layer lm-layer-1">' +
    '<path d="M27.5 15.5h7.2c3.4 2.6 5.3 6.2 5.3 9.9 0 4.1-3.2 6.6-8.9 6.6s-8.9-2.5-8.9-6.6c0-3.7 1.9-7.3 5.3-9.9z" fill="url(#srGold)"/>' +
    '<path d="M27.2 12.2h7.8l-1.6 3.3h-4.6z" fill="url(#srGold)" opacity=".8"/>' +
    '<path d="M31.1 19v9M33.6 21.2c0-1-1.1-1.7-2.5-1.7s-2.5.7-2.5 1.7 1.1 1.5 2.5 1.8 2.5.8 2.5 1.8-1.1 1.7-2.5 1.7-2.5-.7-2.5-1.7" stroke="#F7EFD6" stroke-width="1.5" stroke-linecap="round"/>' +
    '</g>' +
    // bar chart + rising arrow
    '<g class="lm-layer lm-layer-2">' +
    '<rect x="9" y="24" width="5" height="12" rx="1.4" fill="url(#srBlue)"/>' +
    '<rect x="16.5" y="19" width="5" height="17" rx="1.4" fill="url(#srBlue)"/>' +
    '<rect x="24" y="14.5" width="5" height="21.5" rx="1.4" fill="url(#srBlue)" opacity=".9"/>' +
    '<path d="M8 21 17 12.5 23.5 18 34 7.5" stroke="url(#srGold)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M27.5 7h7v7" stroke="url(#srGold)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</g>' +
    // open book (front)
    '<g class="lm-layer lm-layer-3">' +
    '<path d="M24 36.5c-3.6-2.9-8.4-4.2-13.6-4.2L4 40.6c5.9 0 12.6 1.3 20 4.4z" fill="url(#srBlue)"/>' +
    '<path d="M24 36.5c3.6-2.9 8.4-4.2 13.6-4.2L44 40.6c-5.9 0-12.6 1.3-20 4.4z" fill="url(#srGold)"/>' +
    '</g>' +
    '<path class="lm-spark" d="M40.5 4.2l1.3 2.9 3.2.3-2.4 2.1.7 3.1-2.8-1.6-2.8 1.6.7-3.1-2.4-2.1 3.2-.3z" fill="url(#srGold)"/>' +
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
