/**
 * src/services/creatorFeed.js
 *
 * Thin server-side client for the external CreatorFeed API
 * (https://prod.creatorfeed.in/api/...), per the collection the client
 * shared:
 *   POST /api/creator-payouts     — submit a payout request
 *   POST /api/managers            — assign a manager to a user
 *   GET  /api/managers/{id}       — fetch an assigned manager's details
 *
 * All three authenticate with a bearer token issued by the CreatorFeed
 * team. That token lives ONLY in the server environment
 * (CREATORFEED_API_TOKEN) and is never exposed to the browser — the
 * frontend talks to our own /api/v1/creator-feed/* proxy routes instead
 * (src/routes/creatorFeed.routes.js).
 *
 * Nothing else in the app depends on this file; it is additive and does
 * not touch the existing reward/wallet/payout engines.
 */

const config = require('../config/env');
const { createHttpError } = require('../utils/httpError');

const DEFAULT_TIMEOUT_MS = 15000;

function assertConfigured() {
  if (!config.creatorFeed.apiToken) {
    throw createHttpError(
      503,
      'Creator Feed is not configured yet. Add CREATORFEED_API_TOKEN to the server environment.'
    );
  }
}

async function request(path, { method = 'GET', body } = {}) {
  assertConfigured();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${config.creatorFeed.baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.creatorFeed.apiToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw createHttpError(502, 'Could not reach the Creator Feed service. Please try again shortly.');
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (parseErr) {
    data = null;
  }

  if (!response.ok) {
    const message = (data && (data.message || data.error)) || 'Creator Feed request failed.';
    throw createHttpError(response.status === 401 ? 502 : response.status, String(message));
  }

  return data;
}

function submitPayoutRequest(payload) {
  return request('/api/creator-payouts', { method: 'POST', body: payload });
}

function assignManager(payload) {
  return request('/api/managers', { method: 'POST', body: payload });
}

function getManager(managerId) {
  return request(`/api/managers/${encodeURIComponent(managerId)}`);
}

module.exports = { submitPayoutRequest, assignManager, getManager };
