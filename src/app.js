/**
 * src/app.js
 *
 * Builds and configures the Express app (middleware stack + routes), but
 * does NOT start listening — that's server.js's job. Kept separate so
 * (a) tests can import the app without binding a port, and (b) server.js
 * stays focused on process-level concerns (DB connectivity check, startup
 * logging, graceful shutdown).
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config/env');
const routes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// --- Trust proxy (Checkpoint 9) ---------------------------------------------
// Needed for `req.ip` (and therefore express-rate-limit's per-IP limiting,
// AND Checkpoint 9's same-IP signup fraud detection) to see the real client
// IP instead of the reverse proxy's own — per README's Hostinger VPS target,
// production sits behind exactly one reverse-proxy hop (nginx/Certbot), so
// `1` is correct there. In development/test there's no proxy in front, so
// trusting `X-Forwarded-For` would let a client spoof its own IP — kept off
// (`false`) outside production for that reason, not just because it's
// unnecessary locally.
app.set('trust proxy', config.isProduction ? 1 : false);

// --- Security headers --------------------------------------------------------
// Checkpoint 10: default CSP is same-origin-only, which would silently
// block the public frontend's Google Fonts (fonts.googleapis.com serves
// the CSS, fonts.gstatic.com serves the actual font files) — allowlisted
// explicitly rather than disabling CSP or falling back to system fonts.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'style-src': ["'self'", 'fonts.googleapis.com'],
      'font-src': ["'self'", 'fonts.gstatic.com'],
    },
  },
}));

// --- CORS ----------------------------------------------------------------
// Wide open for now during local development. Before deploying to the
// Hostinger VPS (Checkpoint 13), this should be locked down to the actual
// frontend origin(s) — flag this as a deploy-prep TODO, not something to
// silently leave open in production.
app.use(cors({ credentials: true }));

// --- Body / cookie parsing ------------------------------------------------
// CreatorFeed's inbound checkout webhook must be signature-verified over
// the EXACT bytes received, so it gets a raw body parser mounted ahead of
// express.json(). body-parser marks the request as already-parsed, so the
// JSON parser below skips it; every other route is unaffected.
app.use('/api/v1/creator-feed/webhook', express.raw({ type: '*/*', limit: '1mb' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(config.auth.cookieSecret));

// --- Request logging -------------------------------------------------------
// *** SECURITY NOTE (binding for all future checkpoints) ***
// morgan's default format logs method/URL/status only, not the request
// body, so it's safe as configured. If a later checkpoint adds custom
// logging that includes req.body, it MUST strip KYC/financial fields
// first (Aadhaar, PAN, bank account number, passwords) per spec1.md.
if (!config.isProduction) {
  app.use(morgan('dev'));
}

// --- Static file serving --------------------------------------------------
// Checkpoint 10: the public/pre-login frontend — plain HTML/CSS/vanilla JS,
// no build step (see README.md's "Frontend tooling decision" section for
// the full reasoning: none was locked in through Checkpoint 9, so this
// checkpoint made the call). Served from the SAME origin/process as the
// API, so every fetch() in the frontend can just use a relative
// `/api/v1/...` path — no CORS needed between frontend and backend in
// production, and `config.frontendUrl` (used to build password-reset and
// affiliate links) should simply point at this same deployed origin.
//
// This is NOT the same thing app.js's earlier comment warns against for
// `/uploads` — these are genuinely public marketing/auth pages with
// nothing sensitive in them, unlike KYC docs/profile photos, which still
// only exist behind protected routes (Checkpoint 6/7), never here.
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Routes ------------------------------------------------------------
app.use('/api/v1', routes);

// --- Uploads (protected, not static) ---------------------------------------
// Intentionally NOT using express.static() for /uploads. Per spec1.md,
// sensitive files (KYC docs, profile photos) must be served through
// protected routes with an ownership/auth check, not a public static path.
// The actual protected-route pattern is built in Checkpoint 6 (first real
// use case: course lecture access) and reused for KYC/photos later.

// --- 404 + error handling (must be last) -----------------------------------
app.use(notFound);
app.use(errorHandler);

module.exports = app;
