/**
 * public/assets/js/ui.js
 *
 * Small shared UI helpers used across pages — deliberately dependency-free
 * to keep the no-build-step frontend lean (see README's frontend tooling
 * decision). None of these touch the API; they are presentation only.
 *
 *   toast()          — transient feedback (copy, save, withdrawal placed)
 *   copyToClipboard()— clipboard write with a graceful execCommand fallback
 *   countUp()        — animates a number into place (respects reduced motion)
 *   skeleton()       — markup for loading placeholders
 *   errorState()     — consistent friendly failure block
 *   setLoading()     — button busy state
 *   observeReveal()  — scroll-reveal for elements added after page load
 */

(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function stack() {
    var el = document.querySelector('.toast-stack');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast-stack';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }

  window.toast = function (message, variant) {
    var el = document.createElement('div');
    el.className = 'toast toast-' + (variant || 'info');
    el.innerHTML = '<span class="toast-dot"></span><span></span>';
    el.lastChild.textContent = message;
    stack().appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 250);
    }, 2800);
  };

  window.copyToClipboard = function (text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var input = document.createElement('textarea');
      input.value = text;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
      } catch (err) {
        reject(err);
      } finally {
        input.remove();
      }
    });
  };

  /**
   * Animates `el` from 0 to `value`. `format` renders each frame, so the
   * caller keeps control of currency/locale formatting — the animation
   * never invents or rounds the final value, it always lands exactly on
   * `format(value)`.
   */
  window.countUp = function (el, value, format) {
    var render = format || function (n) { return String(Math.round(n)); };
    var target = Number(value);
    if (!el || !Number.isFinite(target)) { if (el) el.textContent = render(0); return; }
    if (reduceMotion || target === 0) { el.textContent = render(target); return; }

    var duration = 750;
    var start = performance.now();
    (function frame(now) {
      var progress = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = render(target * eased);
      if (progress < 1) requestAnimationFrame(frame);
      else el.textContent = render(target);
    })(start);
  };

  window.skeleton = function (rows, kind) {
    var out = '';
    for (var i = 0; i < (rows || 3); i++) {
      out += '<div class="skeleton ' + (kind === 'card' ? 'skeleton-card' : 'skeleton-row') + '"></div>';
    }
    return out;
  };

  window.errorState = function (message, retryLabel) {
    return (
      '<div class="alert alert-error" role="alert"><span>' +
      (message || 'We could not load this right now.') +
      (retryLabel ? ' <button class="btn btn-sm btn-ghost" type="button" data-retry>' + retryLabel + '</button>' : '') +
      '</span></div>'
    );
  };

  window.setLoading = function (btn, isLoading, busyLabel) {
    if (!btn) return;
    if (isLoading) {
      btn.dataset.idleLabel = btn.dataset.idleLabel || btn.textContent;
      btn.classList.add('is-loading');
      btn.disabled = true;
      if (busyLabel) btn.textContent = busyLabel;
    } else {
      btn.classList.remove('is-loading');
      btn.disabled = false;
      if (btn.dataset.idleLabel) btn.textContent = btn.dataset.idleLabel;
    }
  };

  window.observeReveal = function (root) {
    var targets = (root || document).querySelectorAll('.reveal:not(.is-visible)');
    if (!targets.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    targets.forEach(function (el) { observer.observe(el); });
  };

  /** Copy buttons declared with `data-copy="<text>"` work with no page JS. */
  document.addEventListener('click', function (event) {
    var btn = event.target.closest && event.target.closest('[data-copy]');
    if (!btn) return;
    window.copyToClipboard(btn.getAttribute('data-copy')).then(
      function () {
        var label = btn.textContent;
        btn.classList.add('is-copied');
        btn.textContent = '\u2713 Copied';
        window.toast('Referral link copied to clipboard', 'success');
        setTimeout(function () {
          btn.classList.remove('is-copied');
          btn.textContent = label;
        }, 1600);
      },
      function () { window.toast('Could not copy — select the link and copy manually', 'error'); }
    );
  });
})();

/* Eye / eye-off icons used by every visibility toggle on the site. */
window.EYE_ICONS =
  '<svg class="icon-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>' +
  '<svg class="icon-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M9.9 4.6A9.9 9.9 0 0 1 12 4.4c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.3 4.2M6.3 6.4A17.5 17.5 0 0 0 2 11.4s3.6 7 10 7a9.7 9.7 0 0 0 4.2-.9"/>' +
  '<path d="M9.9 9.3a3 3 0 0 0 4.2 4.2"/><path d="m2 2 20 20"/></svg>';

/**
 * Visibility toggle — progressive enhancement. Any
 * `input[data-reveal]` (password fields, and the sensitive KYC fields
 * which are rendered as password inputs) gets an eye button injected next
 * to it. The input's name/value and the form's submit payload are
 * untouched; only `type` flips.
 */
window.attachRevealToggles = function (root) {
  (root || document).querySelectorAll('input[data-reveal]:not([data-reveal-ready])').forEach(function (input) {
    input.setAttribute('data-reveal-ready', '1');
    var wrap = document.createElement('div');
    wrap.className = 'password-field';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'reveal-toggle';
    btn.innerHTML = window.EYE_ICONS;
    btn.setAttribute('aria-label', 'Show value');
    btn.setAttribute('title', 'Show');
    btn.addEventListener('click', function () {
      var hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      btn.classList.toggle('is-on', hidden);
      btn.setAttribute('aria-label', hidden ? 'Hide value' : 'Show value');
      btn.setAttribute('title', hidden ? 'Hide' : 'Show');
      input.focus();
    });
    wrap.appendChild(btn);
  });
};

/**
 * Lightweight, presentation-only field validation. Nothing here replaces
 * the server's validation — it only gives instant feedback and keeps
 * obviously-malformed values from being submitted.
 */
window.fieldError = function (input, message) {
  if (!input) return false;
  var host = input.closest('.field') || input.parentNode;
  var slot = host.querySelector('.field-error');
  if (message) {
    if (!slot) {
      slot = document.createElement('span');
      slot.className = 'field-error';
      host.appendChild(slot);
    }
    slot.textContent = message;
    input.classList.remove('is-valid');
    input.classList.add('is-invalid');
    return false;
  }
  if (slot) slot.remove();
  input.classList.remove('is-invalid');
  if (input.value.trim()) input.classList.add('is-valid');
  return true;
};

/** Formats digits into groups, e.g. groupDigits('123456789012', 4) -> '1234 5678 9012'. */
window.groupDigits = function (value, size, separator) {
  var digits = String(value || '').replace(/\D/g, '');
  var out = digits.match(new RegExp('.{1,' + size + '}', 'g'));
  return out ? out.join(separator || ' ') : '';
};

document.addEventListener('DOMContentLoaded', function () { window.attachRevealToggles(); });


/** Inline SVG logo mark — shared by the marketing site, app shell and admin shell. */
window.logoMarkSvg = window.logoMarkSvg || function () {
  return (
    '<svg class="logo-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">' +
    '<defs><linearGradient id="scLogoGrad" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#7C3AED"/><stop offset="55%" stop-color="#A855F7"/><stop offset="100%" stop-color="#22D3EE"/>' +
    '</linearGradient></defs>' +
    '<g class="lm-layer lm-layer-1"><path d="M24 4 42 13 24 22 6 13z" fill="url(#scLogoGrad)"/></g>' +
    '<g class="lm-layer lm-layer-2"><path d="M24 20 42 29 24 38 6 29z" fill="url(#scLogoGrad)" opacity="0.62"/></g>' +
    '<g class="lm-layer lm-layer-3"><path d="M24 30 42 39 24 48 6 39z" fill="url(#scLogoGrad)" opacity="0.34"/></g>' +
    '<circle class="lm-spark" cx="40" cy="9" r="3.4" fill="#22D3EE"/>' +
    '</svg>'
  );
};
