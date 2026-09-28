/**
 * Report service — creation, status machine and listing.
 *
 * Status machine (validated server-side on every transition):
 *   LOST : REPORTED -> MATCHING -> POTENTIAL_MATCH -> VERIFICATION_PENDING
 *                -> VERIFIED -> RETURN_READY -> RETURNED -> CLOSED
 *   FOUND: FOUND -> MATCHING -> MATCHED -> VERIFIED -> RETURNED -> CLOSED
 *
 * MATCHING is TRANSIENT: the AI worker parks a report there while the match run
 * is in flight and settles it afterwards. A run that crashes, times out or finds
 * nothing must therefore be able to leave MATCHING again - otherwise the user is
 * left staring at "AI is scanning" forever, which is exactly what happened when
 * a queued job was lost. Exit-only is allowed from a transient state; every other
 * backwards move stays rejected.
 */
const { getDriver } = require('../store');
const { AppError } = require('../utils/errors');
const { assertRealImage, toPublicUrl, discardFile } = require('../middleware/upload');
const { audit } = require('./auditService');
const notifications = require('./notificationService');
const custody = require('./custodyService');
const matching = require('./matchingService');
const { enqueueMatch } = require('./aiWorker');
const { requireActiveOrg, assertPermission } = require('./orgContext');
const realtime = require('../realtime/events');

const LOST_FLOW = ['REPORTED', 'MATCHING', 'POTENTIAL_MATCH', 'VERIFICATION_PENDING', 'VERIFIED', 'RETURN_READY', 'RETURNED', 'CLOSED'];
const FOUND_FLOW = ['FOUND', 'MATCHING', 'MATCHED', 'VERIFIED', 'RETURNED', 'CLOSED'];

const flowFor = (type) => (type === 'LOST' ? LOST_FLOW : FOUND_FLOW);

/** States a report only passes through while background work is in flight. */
const TRANSIENT_STATUSES = new Set(['MATCHING']);

/** The state a report sits in before the AI has looked at it. */
const preMatchStatus = (type) => (type === 'LOST' ? 'REPORTED' : 'FOUND');

const EDITABLE_FIELDS = [
  'description', 'category', 'location', 'coordinates', 'itemProfile', 'images',
  'lostAt', 'foundAt', 'lastSeen', 'cctvEvents'
];

const STAFF_STATUS_CHANGES = [
  'MATCHING', 'POTENTIAL_MATCH', 'VERIFICATION_PENDING', 'VERIFIED', 'RETURN_READY', 'RETURNED', 'CLOSED'
];

/** Matches the cap the report schemas enforce on `images`. */
const MAX_REPORT_IMAGES = 6;

/**
 * Loads a report and asserts the caller is allowed to edit it.
 *
 * One copy of the rule, used by every write path that is not a status change, so
 * "who may edit this report" cannot drift between the JSON patch endpoint and the
 * photo endpoints. Tenant scoping comes first: a report from another organization
 * is reported as missing, never as forbidden.
 */
async function loadEditableReport(req, id) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);

  const report = await store.findReportById(id);
  if (!report || report.organizationId !== ctx.orgId) throw AppError.notFound('Report not found');

  const isOwner = report.userId === req.user.id;
  const isStaff = ['staff', 'admin', 'owner'].includes(ctx.role);
  if (!isOwner && !isStaff) throw AppError.forbidden('You can only edit your own reports');

  return { store, ctx, report, isOwner, isStaff };
}

/** Records a status transition in the report's own history. */
async function transition(store, report, nextStatus, { userId, note } = {}) {
  const flow = flowFor(report.type);
  const currentIdx = flow.indexOf(report.status);
  const nextIdx = flow.indexOf(nextStatus);

  if (nextIdx === -1) {
    throw AppError.badRequest(`Unknown status "${nextStatus}" for a ${report.type} report`);
  }
  if (nextStatus === report.status) return report;
  // A transient status is a marker, not a milestone: leaving MATCHING for the
  // pre-match state is the honest way to say "the scan finished and found
  // nothing", so it is the one permitted backwards move.
  if (nextIdx < currentIdx && !TRANSIENT_STATUSES.has(report.status)) {
    throw AppError.badRequest(`A ${report.type} report cannot move from ${report.status} back to ${nextStatus}`);
  }

  const history = [...(report.statusHistory || [])];
  history.push({ from: report.status, to: nextStatus, at: new Date(), by: userId || null, note: note || '' });
  const updated = await store.updateReport(report.id, { status: nextStatus, statusHistory: history });
  // Status is what every list, dashboard and timeline sorts by — push the
  // change so the whole organization's screens move without a manual refresh.
  realtime.publish(report.organizationId, {
    type: 'REPORT_UPDATE',
    payload: { action: 'status', reportId: report.id, status: nextStatus, reportType: report.type }
  });
  return updated;
}

/**
 * Marks a report as being scanned right now.
 *
 * Only fires from the pre-match state, so re-running matching on a report that
 * has already progressed never drags it backwards.
 */
async function beginMatching(report, { note } = {}) {
  if (!report || report.status !== preMatchStatus(report.type)) return report;
  return transition(getDriver(), report, 'MATCHING', {
    note: note || 'AI match run started'
  });
}

/**
 * Releases a report parked at MATCHING once the run has finished.
 *
 * `matched` decides where it lands: a real candidate moves the case forward,
 * no candidate returns it to the pre-match state instead of leaving the user
 * with a spinner that never resolves. Idempotent, and a no-op for every report
 * that is not currently at MATCHING, so it is safe to call on every code path.
 */
async function settleMatching(report, { matched, note } = {}) {
  if (!report || report.status !== 'MATCHING') return report;

  const next = report.type === 'LOST'
    ? (matched ? 'POTENTIAL_MATCH' : 'REPORTED')
    : (matched ? 'MATCHED' : 'FOUND');

  return transition(getDriver(), report, next, {
    note: note || (matched
      ? 'Match run produced candidate matches'
      : 'Match run finished with no candidates')
  });
}

async function createReport(req, type) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertPermission(ctx, 'report:create');

  const body = req.body || {};
  const itemProfile = body.itemProfile && typeof body.itemProfile === 'object' ? body.itemProfile : {};
  const description = String(body.description || '').trim();
  const category = String(body.category || itemProfile.category || '').trim();
  const location = String(body.location || '').trim();
  const when = type === 'LOST' ? body.lostAt : body.foundAt;

  if (description.length < 10) throw AppError.badRequest('Please describe the item in at least 10 characters');
  if (!category) throw AppError.badRequest('Category is required');
  if (!location) throw AppError.badRequest('Location is required');
  if (!when) throw AppError.badRequest(type === 'LOST' ? 'Date and time of loss is required' : 'Date and time found is required');

  const images = (Array.isArray(body.images) ? body.images : [])
    .filter(u => typeof u === 'string' && u.length < 2000)
    .slice(0, 6);

  const saved = await store.createReport({
    organizationId: ctx.orgId,
    userId: req.user.id,
    type,
    itemProfile: { ...itemProfile, category: category },
    images,
    description,
    category,
    location,
    coordinates: body.coordinates || { lat: null, lng: null },
    [type === 'LOST' ? 'lostAt' : 'foundAt']: new Date(when),
    status: type === 'LOST' ? 'REPORTED' : 'FOUND',
    lastSeen: body.lastSeen || null,
    embedding: Array.isArray(body.embedding) ? body.embedding : []
  });

  await audit(req, {
    organizationId: ctx.orgId,
    action: 'REPORT_CREATED',
    entityType: 'REPORT',
    entityId: saved.id,
    metadata: { type, category, reference: saved.reference }
  });
  realtime.publish(ctx.orgId, {
    type: 'REPORT_UPDATE',
    payload: { action: 'created', reportId: saved.id, reportType: type }
  });

  // A FOUND report means the organization now physically holds the item, so the
  // chain of custody starts here rather than at the first manual handover. A
  // ledger failure must never lose someone's report, hence warn-only.
  if (type === 'FOUND') {
    try {
      await custody.openChain(saved, {
        actorUserId: req.user.id,
        actorName: req.user.name || '',
        holder: `${ctx.org?.name || 'Organization'} intake desk`
      });
    } catch (err) {
      console.warn(`[custody] could not open the chain for ${saved.reference}: ${err.message}`);
    }
  }

  // Candidate search runs in the background: report creation never blocks on it.
  // The AI worker regenerates this report's embeddings, calls the Python
  // pipeline and persists model-backed evidence. If it is unavailable it falls
  // back to the heuristic matcher, so a report is never left without matches.
  const enqueued = await enqueueMatch(saved.id);
  if (!enqueued) {
    // eslint-disable-next-line global-require
    const matching = require('./matchingService');
    matching.triggerMatching(saved.id);
  }

  // Real embeddings (SigLIP2 for the photo, BGE-M3 for the text) are generated
  // out of band. They upgrade the visual/semantic signals from proxies to real
  // vector math, but a report must never fail or wait on a model server.
  generateEmbeddings(saved).catch((err) => {
    console.warn(`[embeddings] could not generate for ${saved.reference}: ${err.message}`);
  });

  return {
    report: saved,
    organizationId: ctx.orgId,
    message: type === 'LOST' ? 'Lost item reported successfully' : 'Found item registered successfully'
  };
}

/**
 * Builds and persists the report's embeddings.
 * Visual comes from the first image; semantic from a composed text blob. Either
 * can fail independently — the signals the matcher can use are recorded so the
 * UI can state honestly which ones were available.
 */
async function generateEmbeddings(report) {
  const store = getDriver();
  // eslint-disable-next-line global-require
  const aiClient = require('./aiClient');

  const image = (report.images || [])[0];
  const textBlob = [
    report.itemProfile?.itemName,
    report.category,
    report.itemProfile?.brand,
    report.itemProfile?.primaryColor,
    report.itemProfile?.secondaryColor,
    report.itemProfile?.visibleMark,
    report.description
  ].filter(Boolean).join(' · ');

  const sources = {};
  let visual = null;
  let semantic = null;

  if (image) {
    try {
      const res = await aiClient.embedImage({ path: image });
      visual = res?.vector || null;
      sources.visual = visual ? 'siglip2' : null;
    } catch (err) {
      sources.visual = null;
    }
  }

  if (textBlob) {
    try {
      semantic = await aiClient.embedText(textBlob);
      sources.semantic = semantic ? 'bge-m3' : null;
    } catch (err) {
      sources.semantic = null;
    }
  }

  if (!visual && !semantic) return null;

  return store.updateReport(report.id, {
    embedding: visual || [],        // keeps existing cosine() visual signal working
    textEmbedding: semantic || [],
    embeddingSources: sources,
    embeddingUpdatedAt: new Date()
  });
}

async function listReports(req, query) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);

  const canSeeAll = ['staff', 'security', 'admin', 'owner'].includes(ctx.role);
  const mineOnly = query.scope === 'mine' || !canSeeAll;

  const { reports, total } = await store.listReports(ctx.orgId, {
    type: query.type,
    status: query.status,
    category: query.category,
    search: query.search,
    from: query.from,
    to: query.to,
    userId: mineOnly ? req.user.id : query.userId,
    limit: query.limit,
    offset: query.offset
  });

  const reportIds = reports.map(r => r.id);
  const matches = await store.listMatchesForReports(reportIds);
  const byReport = new Map();
  for (const m of matches) {
    for (const rid of [m.lostReportId, m.foundReportId]) {
      if (!byReport.has(rid)) byReport.set(rid, []);
      byReport.get(rid).push(m);
    }
  }

  return {
    reports: reports.map(r => ({ ...r, matches: byReport.get(r.id) || [] })),
    total,
    limit: Number(query.limit) || 50,
    offset: Number(query.offset) || 0
  };
}

async function getReport(req, id) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);

  const report = await store.findReportById(id);
  if (!report || report.organizationId !== ctx.orgId) throw AppError.notFound('Report not found');

  const canSeeAll = ['staff', 'security', 'admin', 'owner'].includes(ctx.role);
  if (report.userId !== req.user.id && !canSeeAll) {
    throw AppError.forbidden('You can only view your own reports');
  }

  const [matches, returns, verifications, owner] = await Promise.all([
    store.listMatchesForReports([report.id]),
    store.listReturns(ctx.orgId, { reportId: report.id }),
    store.listVerifications(ctx.orgId, { reportId: report.id }),
    report.userId === req.user.id ? Promise.resolve(null) : store.findUserById(report.userId)
  ]);

  return {
    report,
    matches,
    returnCase: returns[0] || null,
    verifications,
    // Ownership evidence is never exposed to non-owners.
    owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
    canManage: report.userId === req.user.id || ['staff', 'admin', 'owner'].includes(ctx.role),
    canAuthorizeReturn: ['staff', 'security', 'admin', 'owner'].includes(ctx.role)
  };
}

async function updateReport(req, id, body) {
  const { store, ctx, report: existing, isStaff } = await loadEditableReport(req, id);

  const patch = {};
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  let updated = { ...existing, ...patch };

  if (body.status && body.status !== existing.status) {
    if (!isStaff) throw AppError.forbidden('Only organization staff can change a report status');
    if (!STAFF_STATUS_CHANGES.includes(body.status)) throw AppError.badRequest('Invalid status');
    updated = await transition(store, existing, body.status, { userId: req.user.id, note: body.statusNote });
  }

  if (Object.keys(patch).length) {
    updated = await store.updateReport(id, patch);
  }

  await audit(req, {
    organizationId: ctx.orgId,
    action: 'REPORT_UPDATED',
    entityType: 'REPORT',
    entityId: id,
    metadata: { fields: Object.keys(patch), statusChange: body.status || null }
  });
  realtime.publish(ctx.orgId, { type: 'REPORT_UPDATE', payload: { action: 'updated', reportId: id } });

  // Edited attributes change what the matcher should see.
  matching.triggerMatching(id);
  return { report: updated, message: 'Report updated successfully' };
}

/**
 * Attaches a photo the user took themselves to an existing report.
 *
 * Two deliberate choices:
 *  - The new photo is PREPENDED, so it becomes the cover that every list,
 *    match view and staff handover screen reads (`itemImage()` on the client
 *    returns `images[0]`). Without that, "add my photo" would look like nothing
 *    happened.
 *  - The visual embedding is regenerated from it, because the photo the owner
 *    chose is a better matching signal than whatever was analysed at submission
 *    time.
 *
 * Multer has already written the file by the time we get here, so every failure
 * path has to delete it: a rejected upload must not leave bytes in uploads/.
 */
async function addReportImage(req, id, file) {
  if (!file) throw AppError.badRequest('Attach an image file under the "image" field');

  let context;
  try {
    context = await loadEditableReport(req, id);
    // Magic-byte check: a renamed .exe is not a photo. This also unlinks the
    // file itself when the bytes are not an image.
    assertRealImage(file);
  } catch (err) {
    discardFile(file);
    throw err;
  }

  const { store, ctx, report } = context;
  const url = toPublicUrl(file);

  // De-duplicated so re-uploading the same photo cannot fill the six slots with
  // one picture, and capped so a report can never exceed the schema's limit.
  const images = [url, ...(report.images || []).filter(u => u !== url)].slice(0, MAX_REPORT_IMAGES);
  const updated = await store.updateReport(id, { images });

  await audit(req, {
    organizationId: ctx.orgId,
    action: 'REPORT_IMAGE_ADDED',
    entityType: 'REPORT',
    entityId: id,
    metadata: { reference: report.reference, image: url, imageCount: images.length }
  });
  realtime.publish(ctx.orgId, { type: 'REPORT_UPDATE', payload: { action: 'photos', reportId: id } });

  // Neither of these is worth failing the upload over: the owner's photo is
  // already saved and visible.
  generateEmbeddings(updated)
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(`[report-image] embedding refresh failed for ${report.reference}: ${err.message}`);
    })
    .finally(() => matching.triggerMatching(id));

  return { message: 'Photo added to this item', imageUrl: url, images, report: updated };
}

/**
 * Detaches one photo from a report.
 *
 * The file on disk is deliberately KEPT. Seeded artwork is shared between the
 * lost and the found report of a demo pair, and the same /uploads path may be
 * referenced by a match, a custody row or an audit entry — deleting the bytes
 * would silently blank those screens. Detaching is reversible, deletion is not.
 */
async function removeReportImage(req, id, url) {
  const { store, ctx, report } = await loadEditableReport(req, id);

  const target = String(url || '').trim();
  const images = (report.images || []).map(u => String(u));
  if (!target || !images.includes(target)) {
    throw AppError.badRequest('That photo is not attached to this report');
  }

  const next = images.filter(u => u !== target);
  const updated = await store.updateReport(id, { images: next });

  await audit(req, {
    organizationId: ctx.orgId,
    action: 'REPORT_IMAGE_REMOVED',
    entityType: 'REPORT',
    entityId: id,
    metadata: { reference: report.reference, image: target, imageCount: next.length }
  });
  realtime.publish(ctx.orgId, { type: 'REPORT_UPDATE', payload: { action: 'photos', reportId: id } });

  // Only the cover feeds the visual signal, so removing a secondary photo is
  // not allowed to cost a model call.
  if (images[0] === target) {
    generateEmbeddings(updated)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`[report-image] embedding refresh failed for ${report.reference}: ${err.message}`);
      })
      .finally(() => matching.triggerMatching(id));
  }

  return { message: 'Photo removed from this item', images: next, report: updated };
}

async function deleteReport(req, id) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);

  const existing = await store.findReportById(id);
  if (!existing || existing.organizationId !== ctx.orgId) throw AppError.notFound('Report not found');

  const isOwner = existing.userId === req.user.id;
  const isManager = ['admin', 'owner'].includes(ctx.role);
  if (!isOwner && !isManager) throw AppError.forbidden('You can only delete your own reports');

  await store.deleteReport(id);
  await audit(req, {
    organizationId: ctx.orgId,
    action: 'REPORT_DELETED',
    entityType: 'REPORT',
    entityId: id,
    metadata: { reference: existing.reference }
  });
  realtime.publish(ctx.orgId, { type: 'REPORT_UPDATE', payload: { action: 'deleted', reportId: id } });

  return { message: 'Report deleted successfully' };
}

/** Timeline used by the dashboard + report detail pages. */
function buildTimeline(report) {
  const history = report.statusHistory || [];
  const steps = report.type === 'LOST'
    ? ['REPORTED', 'MATCHING', 'POTENTIAL_MATCH', 'VERIFICATION_PENDING', 'VERIFIED', 'RETURN_READY', 'RETURNED']
    : ['FOUND', 'MATCHING', 'MATCHED', 'VERIFIED', 'RETURNED'];

  const currentIdx = steps.indexOf(report.status);
  return steps.map((label, i) => {
    const entry = history.find(h => h.to === label);
    return {
      label,
      state: i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'upcoming',
      at: entry ? entry.at : (i === 0 ? report.createdAt : null)
    };
  });
}

module.exports = {
  createReport,
  beginMatching,
  settleMatching,
  generateEmbeddings,
  listReports,
  getReport,
  updateReport,
  addReportImage,
  removeReportImage,
  deleteReport,
  transition,
  buildTimeline,
  LOST_FLOW,
  FOUND_FLOW,
  notifications
};
