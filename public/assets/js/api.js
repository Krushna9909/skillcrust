/**
 * public/assets/js/api.js
 *
 * Thin fetch wrapper shared by every page that talks to the backend.
 * Same-origin relative paths (`/api/v1/...`) throughout — see app.js's
 * "Static file serving" comment for why that's safe (frontend and API
 * are served from the same Express process/origin).
 *
 * `credentials: 'include'` on every call so the httpOnly auth cookie
 * (Checkpoint 2) is sent/received correctly even though this is same-
 * origin (harmless to include either way, but explicit is safer than
 * relying on same-origin defaults if the deployment topology ever
 * changes).
 */

const API_BASE = '/api/v1';

/**
 * @param {string} path - e.g. '/courses', '/auth/signup'
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {object} [options.body] - JSON-serialized automatically
 * @returns {Promise<{ ok: boolean, status: number, data: any }>}
 *   Never throws for a normal HTTP error response (4xx/5xx) — callers
 *   check `.ok`/`.status` and read `.data.error.message` for the
 *   server's own error text (every API error follows this project's
 *   `{ error: { message } }` shape, see errorHandler.js). Only throws for
 *   a genuine network failure (server unreachable, etc.).
 */
async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch (parseErr) {
    data = null;
  }

  return { ok: response.ok, status: response.status, data };
}

function apiErrorMessage(result, fallback) {
  if (result && result.data && result.data.error && result.data.error.message) {
    return result.data.error.message;
  }
  return fallback || 'Something went wrong. Please try again.';
}
