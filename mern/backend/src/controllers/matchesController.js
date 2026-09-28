const { asyncHandler, AppError } = require('../utils/errors');
const { getDriver } = require('../store');
const { requireActiveOrg, assertPermission } = require('../services/orgContext');
const { audit } = require('../services/auditService');
const notifications = require('../services/notificationService');
const realtime = require('../realtime/events');

/** GET /api/matches — org-scoped, enriched with both reports. */
const listMatches = asyncHandler(async (req, res) => {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  const query = req.validatedQuery || req.query;
  const canSeeAll = ['staff', 'security', 'admin', 'owner'].includes(ctx.role);

  const { matches, total } = await store.listMatches(ctx.orgId, {
    status: query.status,
    minScore: query.minScore,
    limit: query.limit,
    offset: query.offset
  });

  const scoped = [];
  for (const match of matches) {
    // eslint-disable-next-line no-await-in-loop
    const [lost, found] = await Promise.all([
      store.findReportById(match.lostReportId),
      store.findReportById(match.foundReportId)
    ]);
    if (!lost || !found) continue;
    if (!canSeeAll && lost.userId !== req.user.id && found.userId !== req.user.id) continue;
    if (query.search) {
      const needle = String(query.search).toLowerCase();
      const haystack = [lost.itemProfile?.itemName, lost.category, lost.location, found.location].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(needle)) continue;
    }
    scoped.push({
      ...match,
      lost: { id: lost.id, reference: lost.reference, type: lost.type, itemProfile: lost.itemProfile, images: lost.images, category: lost.category, location: lost.location, createdAt: lost.createdAt, userId: lost.userId },
      found: { id: found.id, reference: found.reference, type: found.type, itemProfile: found.itemProfile, images: found.images, category: found.category, location: found.location, createdAt: found.createdAt, userId: found.userId },
      isMine: lost.userId === req.user.id || found.userId === req.user.id
    });
  }

  res.json({ matches: scoped, total });
});

/** GET /api/matches/:id — full evidence breakdown. */
const getMatchById = asyncHandler(async (req, res) => {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  const match = await store.findMatchById(req.params.id);
  if (!match || match.organizationId !== ctx.orgId) throw AppError.notFound('Match not found');

  const [lost, found, verifications, returnCase] = await Promise.all([
    store.findReportById(match.lostReportId),
    store.findReportById(match.foundReportId),
    store.listVerifications(ctx.orgId, { matchId: match.id }),
    store.findReturnByReportId(match.lostReportId)
  ]);
  if (!lost || !found) throw AppError.notFound('The reports behind this match are unavailable');

  const isParty = lost.userId === req.user.id || found.userId === req.user.id;
  const canSeeAll = ['staff', 'security', 'admin', 'owner'].includes(ctx.role);
  if (!isParty && !canSeeAll) throw AppError.forbidden('You do not have access to this match');

  res.json({
    match,
    lost,
    found,
    verifications: verifications.map(v => ({ id: v.id, status: v.status, verificationScore: v.verificationScore, createdAt: v.createdAt })),
    returnCase: returnCase ? { id: returnCase.id, status: returnCase.status, pickupLocation: returnCase.pickupLocation } : null,
    isMine: isParty,
    canReview: canSeeAll,
    canVerify: isParty && lost.userId === req.user.id,
    disclaimer: 'An AI match is a candidate recommendation, not proof of ownership.'
  });
});

/** POST /api/matches/:id/review — staff disposition. */
const reviewMatch = asyncHandler(async (req, res) => {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertPermission(ctx, 'match:review');

  const match = await store.findMatchById(req.params.id);
  if (!match || match.organizationId !== ctx.orgId) throw AppError.notFound('Match not found');

  const statusMap = { approve: 'APPROVED', reject: 'REJECTED', escalate: 'MANUAL_REVIEW' };
  const next = statusMap[req.body.action];
  if (!next) throw AppError.badRequest('Invalid action');

  const lostReport = await store.findReportById(match.lostReportId);
  const lostOwnerId = lostReport?.userId || null;

  const updated = await store.updateMatch(match.id, {
    status: next,
    reviewedBy: req.user.id,
    reviewedAt: new Date(),
    reviewNotes: req.body.notes || null
  });

  await notifications.notify(lostOwnerId, ctx.orgId, {
    type: notifications.TYPE.REPORT_UPDATE,
    title: `Match ${next.toLowerCase().replace('_', ' ')}`,
    message: `A reviewer ${next === 'APPROVED' ? 'confirmed' : next === 'REJECTED' ? 'dismissed' : 'flagged'} your candidate match.${req.body.notes ? ` Note: ${req.body.notes}` : ''}`,
    referenceId: match.id,
    referenceType: 'MATCH'
  });

  await audit(req, {
    organizationId: ctx.orgId,
    action: 'MATCH_REVIEWED',
    entityType: 'MATCH',
    entityId: match.id,
    metadata: { action: req.body.action, notes: req.body.notes || null }
  });
  realtime.publish(ctx.orgId, {
    type: 'MATCH_UPDATE',
    payload: { action: 'reviewed', matchId: match.id, status: next }
  });

  res.json({ match: updated, message: `Match ${next.toLowerCase()}` });
});

module.exports = { listMatches, getMatchById, reviewMatch };
