const { asyncHandler } = require('../utils/errors');
const auditService = require('../services/auditService');
const { getDriver } = require('../store');
const { requireActiveOrg, assertPermission } = require('../services/orgContext');
const { csvResponse, AUDIT_COLUMNS, stamp } = require('../utils/csv');

const MAX_EXPORT_ROWS = 20000;
const PAGE = 500;

const listAuditLogs = asyncHandler(async (req, res) => {
  const ctx = await requireActiveOrg(req);
  assertPermission(ctx, 'audit:view');
  const query = req.validatedQuery || req.query;
  const { logs, total } = await auditService.list(ctx.orgId, {
    userId: query.userId,
    action: query.action,
    entityType: query.entityType,
    startDate: query.startDate,
    endDate: query.endDate,
    limit: query.limit,
    offset: query.offset
  });
  res.json({ logs, total, limit: Number(query.limit) || 50, offset: Number(query.offset) || 0 });
});

/** Org-scoped distinct action list (never leaks other tenants' action names). */
const listActionTypes = asyncHandler(async (req, res) => {
  const ctx = await requireActiveOrg(req);
  assertPermission(ctx, 'audit:view');
  res.json({ actions: await auditService.listActionTypes(ctx.orgId) });
});

/**
 * GET /api/audit-logs/export
 *
 * The audit trail as evidence, which means the ordering has to be *stable*:
 * newest first, with the row id as a tiebreaker. Several actions routinely share
 * a timestamp (one request writes two rows), and an unstable sort would let a
 * row appear twice or vanish between pages — in a file whose whole point is to
 * prove what happened, in what order.
 *
 * `limit` is not honoured here on purpose: an export is the whole filtered set
 * (up to MAX_EXPORT_ROWS), not the page currently on screen.
 */
const exportAuditLogs = asyncHandler(async (req, res) => {
  const ctx = await requireActiveOrg(req);
  assertPermission(ctx, 'audit:view');

  const query = req.validatedQuery || req.query;
  const filters = {
    userId: query.userId,
    action: query.action,
    entityType: query.entityType,
    startDate: query.startDate,
    endDate: query.endDate
  };

  const rows = [];
  let offset = 0;
  let total = null;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await auditService.list(ctx.orgId, { ...filters, limit: PAGE, offset });
    if (total === null) total = page.total;
    rows.push(...page.logs);
    offset += page.logs.length;
    if (!page.logs.length || rows.length >= total || offset >= MAX_EXPORT_ROWS) break;
  }

  // Resolve actors to names for readability; the id stays in metadata below so a
  // renamed or deleted account is still traceable.
  const members = await getDriver().listMembers(ctx.orgId);
  const byId = new Map(members.map((m) => [m.id, m.name]));
  const withNames = rows.map((l) => ({
    ...l,
    actorName: l.userId ? (byId.get(l.userId) || l.userId) : 'system',
    metadata: l.userId ? { ...(l.metadata || {}), actorUserId: l.userId } : (l.metadata || {})
  }));

  csvResponse(res, stamp('lostlink-audit'), AUDIT_COLUMNS, withNames);
  if (total > MAX_EXPORT_ROWS) {
    // eslint-disable-next-line no-console
    console.warn(`[audit] export truncated at ${MAX_EXPORT_ROWS} of ${total} rows for org ${ctx.orgId}`);
  }
});

module.exports = { listAuditLogs, listActionTypes, exportAuditLogs, MAX_EXPORT_ROWS };
