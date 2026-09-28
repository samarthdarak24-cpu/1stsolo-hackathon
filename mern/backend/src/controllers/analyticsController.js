const { asyncHandler, AppError } = require('../utils/errors');
const { getDriver } = require('../store');
const { requireActiveOrg, assertPermission } = require('../services/orgContext');
const { csvResponse, REPORT_COLUMNS, stamp } = require('../utils/csv');

/** How many rows a single export may contain. */
const MAX_EXPORT_ROWS = 20000;
/** Page size when walking the driver's listReports, which caps its own limit. */
const PAGE = 500;

const getOrganizationAnalytics = asyncHandler(async (req, res) => {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertPermission(ctx, 'analytics:view-org');

  const period = (req.validatedQuery || req.query).period || '30d';
  const stats = await store.getOrgStats(ctx.orgId, period);

  const { reports } = await store.listReports(ctx.orgId, { limit: 500 });
  const byLocation = reports.reduce((acc, r) => {
    const key = (r.location || 'Unknown').split(/[-,]/)[0].trim();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  res.json({
    period,
    stats,
    categoryBreakdown: Object.entries(stats.byCategory).map(([label, value]) => ({ label, value })),
    locationBreakdown: Object.entries(byLocation).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8),
    statusBreakdown: Object.entries(stats.byStatus).map(([label, value]) => ({ label, value })),
    weeklyActivity: stats.weeklyActivity,
    recentMatches: stats.recentMatches
  });
});

/**
 * GET /api/analytics/organization/export
 *
 * The same rows the charts are drawn from, as a CSV an administrator can hand to
 * finance or keep as a record. Filters are the same as the list endpoint
 * (`from`/`to`/`type`/`status`/`category`) so what is exported matches what was
 * on screen.
 *
 * Paged on purpose: the driver caps a single page at 500 rows, and a full
 * history can exceed that. Paging also keeps one big export from holding the
 * whole tenant in memory at once.
 */
const exportOrganizationAnalytics = asyncHandler(async (req, res) => {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertPermission(ctx, 'analytics:view-org');

  const query = req.validatedQuery || req.query;
  const filters = {
    type: query.type,
    status: query.status,
    category: query.category,
    from: query.from,
    to: query.to
  };

  const rows = [];
  let offset = 0;
  let total = null;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await store.listReports(ctx.orgId, { ...filters, limit: PAGE, offset });
    if (total === null) total = page.total;
    rows.push(...page.reports);
    offset += page.reports.length;
    if (!page.reports.length || rows.length >= total || offset >= MAX_EXPORT_ROWS) break;
  }

  // Names, not opaque ids: an export nobody can read is not an export.
  const members = await store.listMembers(ctx.orgId);
  const byId = new Map(members.map((m) => [m.id, m.name]));
  const withNames = rows.map((r) => ({ ...r, userName: byId.get(r.userId) || r.userId }));

  csvResponse(res, stamp('lostlink-reports'), REPORT_COLUMNS, withNames);
  if (total > MAX_EXPORT_ROWS) {
    // eslint-disable-next-line no-console
    console.warn(`[analytics] export truncated at ${MAX_EXPORT_ROWS} of ${total} rows for org ${ctx.orgId}`);
  }
});

/** GET /api/analytics/user — the signed-in user's own numbers. */
const getUserAnalytics = asyncHandler(async (req, res) => {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  const period = (req.validatedQuery || req.query).period || '30d';
  const stats = await store.getUserStats(req.user.id, ctx.orgId, period);

  res.json({
    period,
    stats,
    categoryBreakdown: Object.entries(stats.byCategory).map(([label, value]) => ({ label, value })),
    statusBreakdown: Object.entries(stats.byStatus).map(([label, value]) => ({ label, value })),
    weeklyActivity: stats.weeklyActivity
  });
});

module.exports = { getOrganizationAnalytics, getUserAnalytics, exportOrganizationAnalytics, MAX_EXPORT_ROWS };
