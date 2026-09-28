/**
 * Return service — one-time QR handover.
 *
 * Token lifecycle: a random opaque token is minted when a return is authorised,
 * carries an expiry (config.return.qrTtlMinutes) and is invalidated the moment it
 * is scanned. The QR payload contains only the opaque token plus the return id —
 * no names, emails, or any other private ownership data.
 */
const crypto = require('crypto');
const config = require('../config');
const { getDriver } = require('../store');
const { AppError } = require('../utils/errors');
const { audit } = require('./auditService');
const notifications = require('./notificationService');
const realtime = require('../realtime/events');
const reports = require('./reportService');
const { requireActiveOrg, assertPermission } = require('./orgContext');

const TIMELINE = [
  { key: 'reported', label: 'Reported' },
  { key: 'matched', label: 'Potential Match' },
  { key: 'verified', label: 'Ownership Verification' },
  { key: 'authorized', label: 'Return Authorized' },
  { key: 'ready', label: 'Ready for Pickup' },
  { key: 'completed', label: 'Returned' }
];

const newToken = () => crypto.randomBytes(24).toString('base64url');
const newOtp = () => String(crypto.randomInt(100000, 999999));

const isExpired = (returnObj) => Boolean(returnObj.qrExpiresAt) && new Date(returnObj.qrExpiresAt) < new Date();

/** Hides the token from everyone except the verified owner. */
const publicReturn = (returnObj, { includeToken = false, qrDataUrl } = {}) => ({
  id: returnObj.id,
  reportId: returnObj.reportId,
  status: returnObj.status,
  pickupLocation: returnObj.pickupLocation,
  instructions: returnObj.instructions,
  qrExpiresAt: returnObj.qrExpiresAt,
  usedAt: returnObj.usedAt,
  timestamps: returnObj.timestamps || {},
  verifiedUserId: returnObj.verifiedUserId,
  ...(includeToken ? { qrToken: returnObj.qrToken, otp: returnObj.otp } : {}),
  ...(qrDataUrl ? { qrDataUrl } : {})
});

async function authorizeReturn(req, reportId, body) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertPermission(ctx, 'return:authorize');

  const report = await store.findReportById(reportId);
  if (!report || report.organizationId !== ctx.orgId) throw AppError.notFound('Report not found');

  const verification = (await store.listVerifications(ctx.orgId, { reportId }))
    .find(v => v.status === 'VERIFIED');
  if (!verification) {
    throw AppError.badRequest('Ownership must be verified before a return can be authorised');
  }

  const existing = await store.findReturnByReportId(reportId);
  if (existing && !['COMPLETED', 'EXPIRED', 'REJECTED'].includes(existing.status)) {
    throw AppError.conflict('A return already exists for this report');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.return.qrTtlMinutes * 60000);
  const timestamps = {
    ...(existing?.timestamps || {}),
    reported: report.createdAt,
    matched: (await store.listMatchesForReports([reportId]))[0]?.createdAt || report.createdAt,
    verified: verification.reviewedAt || now,
    authorized: now,
    ready: now
  };

  const payload = {
    organizationId: ctx.orgId,
    reportId,
    verifiedUserId: verification.claimantUserId,
    qrToken: newToken(),
    qrExpiresAt: expiresAt,
    otp: newOtp(),
    handoverStaffId: req.user.id,
    pickupLocation: body.pickupLocation || config.return.pickupLocation,
    instructions: body.instructions || `Present your one-time QR code at ${body.pickupLocation || config.return.pickupLocation} and confirm your identity.`,
    status: 'READY',
    timestamps
  };

  const saved = existing
    // eslint-disable-next-line no-await-in-loop
    ? await store.updateReturn(existing.id, { ...payload, usedAt: null })
    // eslint-disable-next-line no-await-in-loop
    : await store.createReturn(payload);

  if (report.status === 'VERIFIED' || report.status === 'VERIFICATION_PENDING') {
    await reports.transition(store, report, 'RETURN_READY', { userId: req.user.id, note: `Return authorised for pickup at ${saved.pickupLocation}` });
  }

  await notifications.notify(saved.verifiedUserId, ctx.orgId, {
    type: notifications.TYPE.RETURN_READY,
    title: 'Your item is ready for pickup',
    message: `${report.itemProfile?.itemName || report.category} is ready for secure pickup at ${saved.pickupLocation}. Your one-time QR expires in ${config.return.qrTtlMinutes} minutes.`,
    referenceId: reportId,
    referenceType: 'REPORT',
    meta: { returnId: saved.id }
  });

  await audit(req, {
    organizationId: ctx.orgId,
    action: 'RETURN_AUTHORIZED',
    entityType: 'RETURN',
    entityId: saved.id,
    metadata: { reportId, pickupLocation: saved.pickupLocation, expiresAt }
  });
  realtime.publish(ctx.orgId, {
    type: 'RETURN_UPDATE',
    payload: { action: 'authorized', returnId: saved.id, reportId }
  });

  return { returnCase: publicReturn(saved, { includeToken: true }), message: 'Return authorised' };
}

/** QR payload for the owner: opaque token only, plus a rendered image when available. */
async function getReturnQr(req, returnId) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);

  const returnObj = await store.findReturnById(returnId);
  if (!returnObj || returnObj.organizationId !== ctx.orgId) throw AppError.notFound('Return not found');

  const isOwner = returnObj.verifiedUserId === req.user.id;
  if (!isOwner) assertPermission(ctx, 'return:view-all');

  let qrDataUrl = null;
  try {
    // eslint-disable-next-line global-require
    const QRCode = require('qrcode');
    qrDataUrl = await QRCode.toDataURL(JSON.stringify({ t: 'lostlink-return', r: returnObj.id, k: returnObj.qrToken }), {
      errorCorrectionLevel: 'M', margin: 1, width: 480, color: { dark: '#0f172a', light: '#ffffff' }
    });
  } catch {
    qrDataUrl = null;
  }

  return {
    returnCase: publicReturn(returnObj, { includeToken: isOwner, qrDataUrl }),
    payload: { returnId: returnObj.id, token: isOwner ? returnObj.qrToken : undefined },
    expiresInMinutes: config.return.qrTtlMinutes,
    expired: isExpired(returnObj),
    isOwner
  };
}

async function listReturns(req, query) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  const canSeeAll = ['staff', 'security', 'admin', 'owner'].includes(ctx.role);

  const rows = await store.listReturns(ctx.orgId, {
    status: query.status,
    reportId: query.reportId,
    verifiedUserId: canSeeAll ? query.userId : req.user.id
  });

  const enriched = [];
  for (const returnObj of rows) {
    // eslint-disable-next-line no-await-in-loop
    const report = await store.findReportById(returnObj.reportId);
    const match = report ? (await store.listMatchesForReports([report.id]))[0] : null;
    const verification = (await store.listVerifications(ctx.orgId, { reportId: returnObj.reportId }))[0];

    enriched.push({
      ...publicReturn(returnObj, { includeToken: returnObj.verifiedUserId === req.user.id }),
      report: report ? {
        id: report.id,
        reference: report.reference,
        type: report.type,
        itemProfile: report.itemProfile,
        images: report.images,
        category: report.category,
        location: report.location,
        status: report.status
      } : null,
      match: match ? { id: match.id, finalScore: match.finalScore, status: match.status } : null,
      verification: verification ? { id: verification.id, status: verification.status } : null,
      timeline: buildTimeline(returnObj, report, match, verification),
      organization: { id: ctx.org.id, name: ctx.org.name }
    });
  }

  return { returns: enriched, total: enriched.length };
}

function buildTimeline(returnObj, report, match, verification) {
  const t = returnObj.timestamps || {};
  return TIMELINE.map((step, i) => {
    const at = t[step.key]
      || (step.key === 'reported' ? report?.createdAt : null)
      || (step.key === 'matched' ? match?.createdAt : null)
      || (step.key === 'verified' ? verification?.reviewedAt : null);
    return { ...step, at: at || null, state: at ? (i === TIMELINE.length - 1 && returnObj.status !== 'COMPLETED' ? 'current' : 'done') : (i === 0 ? 'current' : 'upcoming') };
  });
}

/**
 * Records one failed scan attempt and, when the reason could matter to the
 * owner, alerts them too. Every attempt becomes an audit row (the scan log);
 * only actionable or suspicious reasons notify — an expired code means "get a
 * fresh one", a wrong code or an unfamiliar QR could mean someone else is
 * trying. Pattern studied from tagd (MIT), which logs every tag scan and
 * notifies the owner the moment it happens — see ATTRIBUTION.md.
 */
async function recordScanFailure(req, ctx, returnId, returnObj, reason, ownerAlert) {
  await audit(req, {
    organizationId: ctx.orgId,
    action: 'QR_SCAN_FAILED',
    entityType: 'RETURN',
    entityId: returnId,
    metadata: { reason, reportId: returnObj.reportId, pickupLocation: returnObj.pickupLocation }
  });
  if (ownerAlert) {
    await notifications.notify(returnObj.verifiedUserId, ctx.orgId, {
      type: notifications.TYPE.SYSTEM,
      title: 'A scan of your return code did not go through',
      message: ownerAlert,
      referenceId: returnObj.reportId,
      referenceType: 'REPORT',
      meta: { reason }
    });
  }
}

/** Staff scans the owner's QR. Validates org, token, expiry and single use. */
async function scanAndComplete(req, returnId, body) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertPermission(ctx, 'return:complete');

  const returnObj = await store.findReturnById(returnId);
  if (!returnObj || returnObj.organizationId !== ctx.orgId) throw AppError.notFound('Return not found');

  const token = String(body.token || '');
  const provided = Buffer.from(token);
  const expected = Buffer.from(String(returnObj.qrToken));
  const tokenValid = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);

  if (!tokenValid) {
    await recordScanFailure(req, ctx, returnId, returnObj, 'Invalid token',
      `A QR code that does not match your return was scanned at ${returnObj.pickupLocation}. If you did not present your code, contact the organization.`);
    throw AppError.badRequest('This QR code is not valid for this return');
  }
  if (returnObj.status === 'COMPLETED') {
    await recordScanFailure(req, ctx, returnId, returnObj, 'Already completed', null);
    throw AppError.badRequest('This return has already been completed');
  }
  if (returnObj.status === 'REJECTED') {
    await recordScanFailure(req, ctx, returnId, returnObj, 'Rejected return', null);
    throw AppError.badRequest('This return was rejected');
  }
  if (isExpired(returnObj)) {
    await store.updateReturn(returnId, { status: 'EXPIRED' });
    await recordScanFailure(req, ctx, returnId, returnObj, 'Expired code',
      `Your one-time return code expired at ${new Date(returnObj.qrExpiresAt).toLocaleString()} before it could be scanned. Request a fresh code from the lost & found desk.`);
    throw AppError.badRequest('This QR code has expired — ask the owner to request a new code');
  }
  if (body.otp && String(body.otp) !== String(returnObj.otp)) {
    await recordScanFailure(req, ctx, returnId, returnObj, 'Wrong handover code',
      `An incorrect handover code was entered for your return at ${returnObj.pickupLocation}. If you did not ask staff to scan your code, contact the organization.`);
    throw AppError.badRequest('The handover code does not match');
  }

  const now = new Date();
  const completed = await store.updateReturn(returnId, {
    status: 'COMPLETED',
    handoverStaffId: req.user.id,
    usedAt: now,
    qrExpiresAt: now,
    timestamps: { ...(returnObj.timestamps || {}), completed: now }
  });
  realtime.publish(ctx.orgId, {
    type: 'RETURN_UPDATE',
    payload: { action: 'completed', returnId, reportId: returnObj.reportId }
  });

  const report = await store.findReportById(returnObj.reportId);
  if (report && report.status !== 'RETURNED') {
    await reports.transition(store, report, 'RETURNED', { userId: req.user.id, note: 'Handover completed at pickup point' });
  }

  const foundReport = report ? (await store.listMatchesForReports([report.id]))[0] : null;
  if (foundReport) {
    const counterpart = foundReport.lostReportId === report.id ? foundReport.foundReportId : foundReport.lostReportId;
    const other = await store.findReportById(counterpart);
    if (other && other.type === 'FOUND' && other.status !== 'RETURNED') {
      await reports.transition(store, other, 'RETURNED', { userId: req.user.id, note: 'Item returned to its owner' });
    }
  }

  await notifications.notify(returnObj.verifiedUserId, ctx.orgId, {
    type: notifications.TYPE.ITEM_RETURNED,
    title: 'Item returned successfully',
    message: `${report?.itemProfile?.itemName || 'Your item'} was handed over at ${returnObj.pickupLocation}. Thank you for using LostLink AI.`,
    referenceId: returnObj.reportId,
    referenceType: 'REPORT'
  });

  await audit(req, {
    organizationId: ctx.orgId,
    action: 'QR_SCANNED',
    entityType: 'RETURN',
    entityId: returnId,
    metadata: { reportId: returnObj.reportId, pickupLocation: returnObj.pickupLocation }
  });

  return { returnCase: publicReturn(completed), message: 'Return completed successfully' };
}

/** Owner requests a fresh QR (new token + new expiry). */
async function refreshQr(req, returnId) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);

  const returnObj = await store.findReturnById(returnId);
  if (!returnObj || returnObj.organizationId !== ctx.orgId) throw AppError.notFound('Return not found');
  if (returnObj.verifiedUserId !== req.user.id) throw AppError.forbidden('Only the item owner can refresh this QR code');
  if (returnObj.status === 'COMPLETED') throw AppError.badRequest('This return has already been completed');

  const now = new Date();
  const updated = await store.updateReturn(returnId, {
    qrToken: newToken(),
    qrExpiresAt: new Date(now.getTime() + config.return.qrTtlMinutes * 60000),
    usedAt: null,
    status: 'READY',
    timestamps: { ...(returnObj.timestamps || {}), ready: now }
  });

  await audit(req, {
    organizationId: ctx.orgId,
    action: 'QR_REFRESHED',
    entityType: 'RETURN',
    entityId: returnId,
    metadata: { expiresAt: updated.qrExpiresAt }
  });
  realtime.publish(ctx.orgId, {
    type: 'RETURN_UPDATE',
    payload: { action: 'refreshed', returnId, reportId: returnObj.reportId }
  });

  return { returnCase: publicReturn(updated, { includeToken: true }), message: 'A new one-time QR code has been generated' };
}

module.exports = { authorizeReturn, getReturnQr, listReturns, scanAndComplete, refreshQr, publicReturn, buildTimeline };
