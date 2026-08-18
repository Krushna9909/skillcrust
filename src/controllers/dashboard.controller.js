/**
 * src/controllers/dashboard.controller.js
 *
 * Checkpoint 7: the read-heavy sidebar endpoints — dashboard, affiliate
 * links, upgrade, leaderboard, and "My Courses." All mounted in
 * user.routes.js. Profile (a mutation-heavy concern with its own file-
 * upload complexity) lives in the separate profile.controller.js instead.
 *
 * *** "My Courses" note ***
 * `GET /user/my-courses` was tagged `notImplemented(..., 6)` in the route
 * stub since Checkpoint 0, but Checkpoint 6's actual written goal/
 * deliverables never listed it (only `GET /courses/:id/lectures`, the
 * lecture list WITHIN one course, which Checkpoint 6 did build) — this
 * was a genuine miss in Checkpoint 6's own work, not a deliberate
 * deferral. Implementing it here since it needs the exact same "owned
 * courses" query the dashboard needs anyway. Flagged clearly in
 * checkpoint.md rather than silently backfilling it.
 */

const { pool } = require('../config/db');
const config = require('../config/env');
const courseModel = require('../models/course.model');
const rewardTransactionModel = require('../models/rewardTransaction.model');

function serializeCourse(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    // Only present on rows that selected the reward-split columns
    // (Upgrade's query does; owned-courses' query doesn't need them).
    directBonus: row.direct_bonus,
    indirectBonus: row.indirect_bonus,
    companyCut: row.company_cut,
  };
}

/**
 * GET /user/dashboard — spec1.md: name, owned courses, revenue
 * today/7d/30d/all-time, revenue chart, recent referrals (with search).
 */
async function getDashboard(req, res, next) {
  try {
    const [ownedCourses, revenueSummary, revenueChart, recentReferrals] = await Promise.all([
      courseModel.findOwnedCoursesByUserId(pool, req.user.id),
      rewardTransactionModel.getRevenueSummary(pool, req.user.id),
      rewardTransactionModel.getRevenueChartData(pool, req.user.id, 30),
      rewardTransactionModel.getRecentReferrals(pool, req.user.id, {
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
      }),
    ]);

    return res.status(200).json({
      ownedCourses: ownedCourses.map(serializeCourse),
      revenue: {
        today: revenueSummary.today,
        last7Days: revenueSummary.last_7_days,
        last30Days: revenueSummary.last_30_days,
        allTime: revenueSummary.all_time,
      },
      revenueChart: revenueChart.map((row) => ({ date: row.date, amount: row.amount })),
      recentReferrals: recentReferrals.map((row) => ({
        buyerName: row.buyer_name,
        buyerReferCode: row.buyer_refer_code,
        packageName: row.package_name,
        amount: row.amount,
        createdAt: row.created_at,
      })),
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /user/affiliate-links — spec1.md: "Shareable links per owned
 * course (opening the link auto-fills the refer code at signup,
 * pre-selected to that course)." Pure computation from data already
 * available (the user's own refer_code + their owned course ids) — no
 * separate storage needed, matches Checkpoint 2's `?referCode=...&
 * courseId=...` signup query params.
 *
 * URL points at `/signup.html` (not `/signup`) — Checkpoint 10's static
 * pages don't have clean-URL rewriting configured (`express.static` has
 * no `extensions` option set), so `/signup` alone would 404. This was a
 * real bug until Checkpoint 11 caught and fixed it — `config.frontendUrl`
 * itself had a second, related bug (a stale `:3000` default from before
 * Checkpoint 10 made the frontend same-origin) fixed alongside this one;
 * see config/env.js's comment.
 */
async function getAffiliateLinks(req, res, next) {
  try {
    const ownedCourses = await courseModel.findOwnedCoursesByUserId(pool, req.user.id);

    const links = ownedCourses.map((course) => ({
      courseId: course.id,
      courseName: course.name,
      url: `${config.frontendUrl}/signup.html?referCode=${req.user.referCode}&courseId=${course.id}`,
    }));

    return res.status(200).json({ affiliateLinks: links });
  } catch (err) {
    return next(err);
  }
}

/** GET /user/upgrade — spec1.md: "Cards for unowned courses." */
async function getUpgradeOptions(req, res, next) {
  try {
    const courses = await courseModel.findUnownedActiveCoursesForUser(pool, req.user.id);
    return res.status(200).json({ courses: courses.map(serializeCourse) });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /user/leaderboard — spec1.md: "Top earners: today, last 7 days,
 * last 30 days, all-time." Top 10 per window (not specified by spec1.md;
 * flag if a different count is wanted).
 */
async function getLeaderboard(req, res, next) {
  const LIMIT = 10;
  try {
    const [today, last7Days, last30Days, allTime] = await Promise.all([
      rewardTransactionModel.getLeaderboard(pool, {
        since: new Date(new Date().setUTCHours(0, 0, 0, 0)),
        limit: LIMIT,
      }),
      rewardTransactionModel.getLeaderboard(pool, {
        since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        limit: LIMIT,
      }),
      rewardTransactionModel.getLeaderboard(pool, {
        since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        limit: LIMIT,
      }),
      rewardTransactionModel.getLeaderboard(pool, { limit: LIMIT }),
    ]);

    const serializeEntries = (rows) => rows.map((row) => ({
      userId: row.id,
      fullName: row.full_name,
      referCode: row.refer_code,
      totalEarned: row.total_earned,
    }));

    return res.status(200).json({
      today: serializeEntries(today),
      last7Days: serializeEntries(last7Days),
      last30Days: serializeEntries(last30Days),
      allTime: serializeEntries(allTime),
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /user/my-courses — spec1.md: "Cards for owned courses." */
async function getMyCourses(req, res, next) {
  try {
    const courses = await courseModel.findOwnedCoursesByUserId(pool, req.user.id);
    return res.status(200).json({ courses: courses.map(serializeCourse) });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getDashboard,
  getAffiliateLinks,
  getUpgradeOptions,
  getLeaderboard,
  getMyCourses,
};
