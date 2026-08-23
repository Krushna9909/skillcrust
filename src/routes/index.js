/**
 * src/routes/index.js
 *
 * Mounts every route module under a common /api/v1 prefix. app.js only
 * needs to know about this one file, not each individual route module.
 *
 * CONVENTION: route paths are kebab-case, versioned (/api/v1/...), and
 * grouped by resource area matching the route filenames below.
 */

const express = require('express');

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const courseRoutes = require('./course.routes');
const walletRoutes = require('./wallet.routes');
const kycRoutes = require('./kyc.routes');
const adminRoutes = require('./admin.routes');
const metaRoutes = require('./meta.routes');
const creatorFeedRoutes = require('./creatorFeed.routes');

const router = express.Router();

// Simple health check — useful for confirming the server + this router are
// wired up correctly before any real endpoints exist.
router.get('/health', (req, res) => {
  res.json({ status: 'ok', checkpoint: 0 });
});

router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/courses', courseRoutes);
router.use('/wallet', walletRoutes);
router.use('/kyc', kycRoutes);
router.use('/admin', adminRoutes);
router.use('/meta', metaRoutes);
router.use('/creator-feed', creatorFeedRoutes);

module.exports = router;
