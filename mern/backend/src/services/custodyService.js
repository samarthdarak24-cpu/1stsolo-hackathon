/**
 * Custody service — the append-only chain of custody for one physical item.
 *
 * Every row answers the only question a handover dispute ever asks: *who held
 * this item, and who took it next*. Records are never updated or deleted; a
 * correction is a new row. Nothing here is inferred from other collections —
 * a record exists only because a staff member wrote it, which is what lets the
 * UI present the chain as evidence rather than as a guess.
 *
 * Tenant rule: a record is always written with the organization id taken from
 * the authenticated user's active organization, never from the request body.
 */
const { getDriver } = require('../store');
const { AppError } = require('../utils/errors');
const { audit } = require('./auditService');
const notifications = require('./notificationService');
const realtime = require('../realtime/events');
const { requireActiveOrg, assertPermission } = require('./orgContext');
const { sealRecord, verifyChain } = require('./custodyChain');

/** Events that move the item to a new holder (they need a `toCustodian`). */
const HANDOFF_EVENTS = ['LOGGED', 'STORED', 'HANDED_TO_STAFF', 'HANDED_OVER', 'RELEASED'];
const EVENT_LABELS = {
  LOGGED: 'Logged in',
  STORED: 'Stored',
  MOVED: 'Moved',
  HANDED_TO_STAFF: 'Handed to staff',
  HANDED_OVER: 'Handed over',
  RELEASED: 'Released',
  DISPOSED: 'Disposed',
  NOTE: 'Note'
};

/** Loads a report and proves it belongs to the caller's active organization. */
async function reportInOrg(store, reportId, orgId) {
  const report = await store.findReportById(reportId);
  if (!report || report.organizationId !== orgId) throw AppError.notFound('Report not found');
  return report;
}

/** Minimal report header attached to a custody row so the board needs no N+1 calls. */
const reportHeader = (report) => ({
  id: report.id,
  reference: report.reference,
  type: report.type,
  status: report.status,
  category: report.category,
  location: report.location,
  itemName: report.itemProfile?.itemName || '',
  images: report.images || []
});

/** GET /api/custody — newest first, optionally filtered to one item or event. */
async function listCustody(req, query = {}) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertPermission(ctx, 'custody:view');

  const { records, total } = await store.listCustodyRecords(ctx.orgId, {
    reportId: query.reportId,
    event: query.event,
    from: query.from,
    to: query.to,
    limit: query.limit,
    offset: query.offset
  });

  const reportIds = [...new Set(records.map(r => r.reportId))];
  const reports = await Promise.all(reportIds.map(id => store.findReportById(id)));
  const byId = new Map(reports.filter(Boolean).map(r => [r.id, r]));

  return {
    records: records.map(r => ({
      ...r,
      eventLabel: EVENT_LABELS[r.event] || r.event,
      report: byId.has(r.reportId) ? reportHeader(byId.get(r.reportId)) : null
    })),
    total,
    limit: Number(query.limit) || 200,
    offset: Number(query.offset) || 0
  };
}

/** GET /api/custody/:id */
async function getCustodyRecord(req, id) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertPermission(ctx, 'custody:view');

  const record = await store.findCustodyRecordById(id);
  if (!record || record.organizationId !== ctx.orgId) throw AppError.notFound('Custody record not found');

  const report = await store.findReportById(record.reportId);
  return {
    record: { ...record, eventLabel: EVENT_LABELS[record.event] || record.event },
    report: report ? reportHeader(report) : null
  };
}

/**
 * Who holds the item right now, according to the chain.
 *
 * Walks back to the most recent row that actually names a holder: a NOTE or a
 * DISPOSED entry says nothing about custody, so it must not erase the holder that
 * the previous hand-off established. This is what keeps the chain continuous
 * across rows that only add context.
 */
function lastKnownHolder(records) {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const holder = String(records[i]?.toCustodian || '').trim();
    if (holder) return holder;
  }
  return '';
}

/** GET /api/reports/:id/custody — the whole trail for one item, oldest first. */
async function getReportCustody(req, reportId) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);

  const report = await reportInOrg(store, reportId, ctx.orgId);
  // The owner always sees the custody of THEIR item; everyone else needs the
  // staff-level custody permission. Without this an owner is locked out of the
  // very trail that explains where their property went.
  if (report.userId !== req.user.id) assertPermission(ctx, 'custody:view');

  const [records, returnCase] = await Promise.all([
    store.listCustodyRecordsForReport(report.id),
    store.findReturnByReportId(report.id)
  ]);

  return {
    report: reportHeader(report),
    returnCase: returnCase
      ? {
          id: returnCase.id,
          status: returnCase.status,
          pickupLocation: returnCase.pickupLocation,
          usedAt: returnCase.usedAt
        }
      : null,
    currentHolder: lastKnownHolder(records),
    custody: records.map(r => ({ ...r, eventLabel: EVENT_LABELS[r.event] || r.event }))
  };
}

/**
 * POST /api/reports/:id/custody — append one link to the chain.
 *
 * `fromCustodian` defaults to whoever holds the item according to the previous
 * row, so the chain stays continuous without the client having to know it.
 */
async function addCustodyRecord(req, reportId, body = {}) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertPermission(ctx, 'custody:view');

  const report = await reportInOrg(store, reportId, ctx.orgId);
  const event = body.event || 'NOTE';

  const history = await store.listCustodyRecordsForReport(report.id);
  // Continuity: the item comes from whoever the chain last named as the holder,
  // even if the most recent row was a note that named nobody.
  const previousHolder = lastKnownHolder(history);
  const fromCustodian = String(body.fromCustodian || previousHolder || '').trim();
  const toCustodian = String(body.toCustodian || '').trim();

  if (HANDOFF_EVENTS.includes(event) && !toCustodian) {
    throw AppError.badRequest(
      `A "${EVENT_LABELS[event] || event}" entry must name who holds the item now (toCustodian)`
    );
  }

  if (body.occurredAt) {
    const when = new Date(body.occurredAt);
    if (Number.isNaN(when.getTime())) throw AppError.badRequest('occurredAt is not a valid date');
    if (when.getTime() > Date.now() + 5 * 60000) {
      throw AppError.badRequest('occurredAt cannot be in the future');
    }
  }

  const [matches, returnCase] = await Promise.all([
    store.listMatchesForReports([report.id]),
    store.findReturnByReportId(report.id)
  ]);
  const bestMatch = matches.slice().sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))[0] || null;

  const record = await store.createCustodyRecord(sealRecord({
    organizationId: ctx.orgId,
    reportId: report.id,
    matchId: bestMatch ? bestMatch.id : null,
    returnId: returnCase ? returnCase.id : null,
    event,
    fromCustodian,
    toCustodian,
    location: String(body.location || report.location || '').trim(),
    note: String(body.note || '').trim(),
    evidence: Array.isArray(body.evidence) ? body.evidence : [],
    actorUserId: req.user.id,
    actorName: req.user.name || '',
    occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date()
    // Chains onto the last row's digest, so a later insert or edit anywhere in
    // the trail is detectable.
  }, history[history.length - 1]?.hash || ''));

  audit(req, {
    organizationId: ctx.orgId,
    action: 'CUSTODY_RECORDED',
    entityType: 'REPORT',
    entityId: report.id,
    metadata: { custodyId: record.id, event, fromCustodian, toCustodian }
  });
  // The custody ledger is a live feed — handovers show up on the org screen
  // the moment they are written, not on someone's next refresh.
  realtime.publish(ctx.orgId, {
    type: 'CUSTODY_UPDATE',
    payload: { action: 'added', reportId: report.id, custodyId: record.id, event }
  });

  // The owner is the person who actually cares that their item moved.
  if (report.userId && report.userId !== req.user.id && ['HANDED_OVER', 'RELEASED'].includes(event)) {
    await notifications.notify(report.userId, ctx.orgId, {
      type: notifications.TYPE.ITEM_RETURNED,
      title: `Custody update for ${report.reference || 'your report'}`,
      message: `Recorded as "${EVENT_LABELS[event] || event}"${toCustodian ? ` to ${toCustodian}` : ''}.`,
      referenceId: report.id,
      referenceType: 'REPORT',
      meta: { custodyId: record.id, event }
    });
  }

  return {
    message: 'Custody record added',
    record: { ...record, eventLabel: EVENT_LABELS[record.event] || record.event },
    total: history.length + 1
  };
}

/**
 * Opens the chain for an item the organization has physically taken charge of.
 *
 * This is a SYSTEM write, not an HTTP one: a member of the public who hands an
 * item in holds no `custody:view` permission, yet the chain must still begin at
 * the moment of receipt - otherwise the first handover has nothing to continue
 * from. It is idempotent (one open per item) and it must never be allowed to
 * fail report intake, so callers wrap it in a try/catch and only warn.
 */
async function openChain(report, { actorUserId = null, actorName = '', holder = '' } = {}) {
  const store = getDriver();
  const previous = await store.listCustodyRecordsForReport(report.id);
  if (previous.length) return null;

  const record = await store.createCustodyRecord(sealRecord({
    organizationId: report.organizationId,
    reportId: report.id,
    matchId: null,
    returnId: null,
    event: 'LOGGED',
    fromCustodian: '',
    toCustodian: holder || 'Intake desk',
    location: report.location || '',
    note: 'Item received and entered into custody at intake.',
    evidence: [],
    actorUserId,
    actorName,
    occurredAt: new Date()
  }));
  realtime.publish(report.organizationId, {
    type: 'CUSTODY_UPDATE',
    payload: { action: 'opened', reportId: report.id, custodyId: record.id }
  });
  return record;
}

/**
 * GET /api/reports/:id/custody/verify
 *
 * Re-computes the whole chain for one item and reports the first row that does
 * not verify. Any staff member who can see custody can run it: the point is that
 * the check is cheap and repeatable, not that it is privileged.
 */
async function verifyCustodyChain(req, reportId) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);

  const report = await reportInOrg(store, reportId, ctx.orgId);
  if (report.userId !== req.user.id) assertPermission(ctx, 'custody:view');

  const records = await store.listCustodyRecordsForReport(report.id);
  const result = verifyChain(records);

  return {
    report: reportHeader(report),
    ...result,
    message: result.valid
      ? `Chain intact across ${result.checked} signed record(s)${result.legacy ? ` (${result.legacy} legacy record(s) predate hashing)` : ''}.`
      : `Chain broken at ${result.brokenAt?.event || 'a record'}: ${result.detail}`
  };
}

module.exports = {
  EVENT_LABELS,
  HANDOFF_EVENTS,
  listCustody,
  getCustodyRecord,
  getReportCustody,
  addCustodyRecord,
  openChain,
  verifyCustodyChain
};

