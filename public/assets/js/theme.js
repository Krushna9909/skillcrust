/**
 * public/assets/js/theme.js
 *
 * SkillCrust is dark-mode only. This file simply locks <html data-theme="dark">
 * before paint. No toggle button is rendered anywhere.
 */
(function () {
  document.documentElement.setAttribute('data-theme', 'dark');
  try { localStorage.removeItem('skillcrust-theme'); } catch (e) {}

  // Kept as no-ops so older shells that call them keep working.
  window.themeToggleMarkup = function () { return ''; };
  window.setTheme = function () {};

  document.addEventListener('DOMContentLoaded', function () {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.querySelectorAll('.theme-toggle').forEach(function (btn) { btn.remove(); });
  });
})();
