/**
 * CCTV service — the only path from the web app to the video-analysis model.
 *
 * There is NO camera integration in this build: no stream to subscribe to, no
 * snapshot endpoint, no retention service. What exists is an analysis service
 * that can search a clip which already sits on ITS OWN filesystem. This module
 * enforces the rules around that single capability:
 *
 *   - the request must name a report inside the caller's active organization
 *   - the organization must not have switched camera requests off
 *   - every request is audited with the actor, the clip and the camera
 *   - object tracking only. No frame is ever passed to a face-recognition
 *     model, and none of the output is stored as a person record.
 *
 * When the analysis service is down the call fails loudly with 503 — there is
 * no heuristic fallback for video, and inventing a last-seen timeline would be
 * worse than returning nothing.
 */
const config = require('../config');
const { getDriver } = require('../store');
const { AppError } = require('../utils/errors');
const { audit } = require('./auditService');
const aiClient = require('./aiClient');
const realtime = require('../realtime/events');
const { requireActiveOrg, assertPermission } = require('./orgContext');

const cameraRequestsAllowed = (ctx) => ctx.org.settings?.allowCctvRequests !== false;


/**
 * GET /api/cctv/status — what this deployment can and cannot actually do.
 * Never throws when the analysis service is down; it reports the state instead.
 */
async function status(req) {
  const ctx = await requireActiveOrg(req);
  assertPermission(ctx, 'custody:view');

  const health = await aiClient.health(); // resolves to an 'unreachable' report on failure
  const providers = Object.entries(health.providers || {}).map(([name, info]) => ({
    name,
    status: info?.status || 'unknown',
    detail: info?.detail || ''
  }));
  const detectionReady = providers.some(p => p.name === 'detector' && ['ready', 'lazy'].includes(p.status));

  let notice;
  if (!config.ai.enabled) {
    notice = 'AI services are switched off on this server (AI_ENABLED=false), so no clip can be searched.';
  } else if (health.status === 'unreachable') {
    notice = `The analysis service at ${config.ai.serviceUrl} is not reachable, so no clip can be searched right now.`;
  } else if (!detectionReady) {
    notice = 'The analysis service is running but object detection is not installed, so video search is unavailable.';
  } else if (!cameraRequestsAllowed(ctx)) {
    notice = 'Camera requests are switched off for this organization in organization settings.';
  } else {
    notice = 'The analysis service is up and can search a clip that already exists on its host. No live camera feed is connected.';
  }

  return {
    aiEnabled: config.ai.enabled,
    serviceUrl: config.ai.serviceUrl,
    serviceStatus: health.status || 'unknown',
    device: health.device || null,
    vectorStore: health.vector_store || 'none',
    providers,
    detectionReady,
    cameraRequestsAllowed: cameraRequestsAllowed(ctx),
    notice
  };
}

function assertCanSearch(ctx) {
  if (!config.ai.enabled) {
    throw new AppError(503, 'AI services are disabled on this server, so video cannot be searched');
  }
  if (!cameraRequestsAllowed(ctx)) {
    throw AppError.forbidden('Camera requests are switched off for this organization');
  }
}

/**
 * POST /api/cctv/analyze — search one clip for the reported item.
 *
 * The clip path is resolved on the analysis service's host, so a request only
 * works when an operator has placed the footage there deliberately. That is the
 * point: nothing is pulled from a camera by this application.
 */
async function analyze(req, body = {}) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertPermission(ctx, 'custody:view');
  assertCanSearch(ctx);

  const report = await store.findReportById(body.reportId);
  if (!report || report.organizationId !== ctx.orgId) throw AppError.notFound('Report not found');

  const videoPath = String(body.videoPath || '').trim();
  if (!videoPath) throw AppError.badRequest('A clip path on the analysis service is required');

  const camera = String(body.camera || '').trim();
  const location = String(body.location || report.lastSeen?.location || report.location || '').trim();
  const sampleFps = Number(body.sampleFps) > 0 ? Number(body.sampleFps) : 0.5;

  // Audited BEFORE the call: a refused or crashed search is still a search, and
  // the log has to show who asked to look at which footage.
  audit(req, {
    organizationId: ctx.orgId,
    action: 'CCTV_ANALYSIS_REQUESTED',
    entityType: 'REPORT',
    entityId: report.id,
    metadata: { videoPath, camera, location, sampleFps }
  });

  const result = await aiClient.cctvAnalyze({
    organization_id: ctx.orgId,
    report_id: report.id,
    video_path: videoPath,
    camera,
    location,
    target_description: [
      report.itemProfile?.itemName,
      report.category,
      report.itemProfile?.primaryColor,
      report.description
    ].filter(Boolean).join(' · '),
    sample_fps: sampleFps
  });

  const events = Array.isArray(result.events) ? result.events : [];
  const lines = events.map(e => formatEvent(e, camera));

  // Keep the evidence on the report so a later viewer can see that a search
  // happened and what it returned. Two forms on purpose: the plain-text one-liner
  // for display, and structured rows so nobody has to parse a sentence to check
  // a claim. Deduplicated on clip + track so a re-run of the same footage does
  // not inflate the record.
  if (lines.length) {
    const rows = events.map((event, index) => ({
      id: `${videoPath}#${event.track_id ?? index}`,
      camera: camera || 'unknown camera',
      location,
      videoPath,
      label: event.label || 'item',
      confidence: typeof event.confidence === 'number' ? event.confidence : null,
      trackId: event.track_id ?? null,
      frameCount: event.frame_count ?? null,
      clipTime: event.detected_at || null,
      recordedAt: new Date().toISOString(),
      recordedBy: req.user.name || '',
      line: lines[index]
    }));

    const merged = [...new Set([...(report.cctvEvents || []), ...lines])].slice(0, 50);
    const known = new Set((report.cctvEvidence || []).map(r => r.id));
    const evidence = [...(report.cctvEvidence || []), ...rows.filter(r => !known.has(r.id))]
      .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt))
      .slice(-100);

    await store.updateReport(report.id, { cctvEvents: merged, cctvEvidence: evidence });
    audit(req, {
      organizationId: ctx.orgId,
      action: 'CCTV_EVIDENCE_RECORDED',
      entityType: 'REPORT',
      entityId: report.id,
      metadata: { eventCount: rows.length, videoPath }
    });
    // Evidence just landed on the report: every open screen that shows this
    // item (detail, custody, CCTV) refetches without anyone reloading.
    realtime.publish(ctx.orgId, {
      type: 'REPORT_UPDATE',
      payload: { action: 'cctv', reportId: report.id }
    });
  }

  return {
    message: result.notice || 'Clip analysis finished',
    reportId: report.id,
    status: result.status || 'completed',
    notice: result.notice || '',
    framesAnalyzed: result.frames_analyzed || 0,
    lastSeen: result.last_seen || null,
    events,
    evidenceRecorded: lines.length,
    camera,
    location,
    sampleFps,
    videoPath,
    // Stated explicitly so no screen can present these as appearance-confirmed.
    methodology: 'Object detection and tracking only. No face recognition, and no identity is derived from the footage.'
  };
}

/** Human-readable one-liner per detected track, stored on the report. */
const formatEvent = (event, camera) => {
  const when = event.detected_at || 'unknown time';
  const what = event.label || 'item';
  const conf = typeof event.confidence === 'number' ? `${Math.round(event.confidence * 100)}% conf` : 'conf n/a';
  const track = event.track_id === null || event.track_id === undefined ? 'no track id' : `track ${event.track_id}`;
  return `[${camera || 'camera'}] ${when} · ${what} · ${conf} · ${track}`;
};

/**
 * GET /api/cctv/events/:reportId — the clip evidence recorded for one item.
 *
 * Returns only what a real analysis produced. When nothing has been searched the
 * list is empty; it is never back-filled with a plausible-looking timeline. The
 * methodology note travels with the data so no screen can present a detection as
 * an identity.
 */
async function listEvents(req, reportId) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertPermission(ctx, 'custody:view');

  const report = await store.findReportById(reportId);
  if (!report || report.organizationId !== ctx.orgId) throw AppError.notFound('Report not found');

  const rows = Array.isArray(report.cctvEvidence) ? report.cctvEvidence : [];

  return {
    reportId: report.id,
    reference: report.reference,
    total: rows.length,
    // Newest first: a staff member is usually checking the search that just ran.
    events: rows.slice().sort((a, b) => new Date(b.recordedAt || 0) - new Date(a.recordedAt || 0)),
    searched: rows.length > 0,
    notice: rows.length
      ? `${rows.length} recorded detection${rows.length === 1 ? '' : 's'}. These are object tracks, not identified people.`
      : 'No clip has been searched for this item yet, so there is no evidence to show.',
    methodology: 'Object detection and tracking only. No face recognition, and no identity is derived from the footage.'
  };
}

module.exports = { status, analyze, listEvents, formatEvent };
