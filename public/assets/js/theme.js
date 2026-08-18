/**
 * public/assets/js/theme.js
 *
 * SkillCrust ships dark-only (per the SkillCrust design brief), so this
 * file no longer switches palettes — it just pins <html data-theme="dark">
 * before paint. `window.themeToggleMarkup()` is kept (returning an empty
 * string) because the app shell and admin shell call it; keeping the
 * function avoids touching that shared code path.
 */

(function () {
  document.documentElement.setAttribute('data-theme', 'dark');

  window.themeToggleMarkup = function () {
    return '';
  };
})();
