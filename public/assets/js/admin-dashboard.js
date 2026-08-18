/**
 * public/assets/js/admin-dashboard.js
 *
 * admin-dashboard.html only — wired to Checkpoint 5/8's
 * `GET /admin/liability-summary` and Checkpoint 8's `GET /admin/users`
 * (just for its `pagination.total`, `pageSize=1` so the actual row
 * fetch is trivial — this page only needs the count, not the list).
 */

document.addEventListener('DOMContentLoaded', async () => {
  const admin = await initAdminShell();
  if (!admin) return; // already redirecting to /admin-login.html

  const [liabilityResult, usersResult] = await Promise.all([
    apiRequest('/admin/liability-summary'),
    apiRequest('/admin/users?pageSize=1'),
  ]);

  if (liabilityResult.ok) {
    document.getElementById('statLiability').textContent = formatRupees(liabilityResult.data.totalUnwithdrawnBalance);
  }
  if (usersResult.ok) {
    document.getElementById('statUserCount').textContent = usersResult.data.pagination.total.toLocaleString('en-IN');
  }
});
