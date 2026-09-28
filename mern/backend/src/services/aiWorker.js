/**
 * AI worker.
 *
 * Runs the expensive work that report submission deliberately does not wait for:
 *
 *   report created
 *     -> load opposite-type reports in the same organization (14-day window)
 *     -> ask the Python service for the full pipeline result
 *     -> persist matches with per-signal evidence
 *     -> notify both parties
 *     -> emit a Socket.IO event
 *
 * Tenant isolation: candidates are loaded with an explicit organizationId taken
 * from the report's own stored record, never from client input.
 *
 * Fallback: if the Python service is unreachable we run the built-in heuristic
 * matcher instead, so reports still get matches on a machine with no models.
 */
const config = require('../config');
const { getDriver } = require('../store');
const aiClient = require('./aiClient');
const notifications = require('./notificationService');
const { getQueue } = require('./aiQueue');
const realtime = require('../realtime/events');

const DAY = 24 * 60 * 60 * 1000;

const relevantDateOf = (report) =>
  report.lostAt || report.foundAt || report.createdAt || null;

/** Shallow projection of a report into the AI service's candidate shape. */
function toCandidate(report) {
  return {
    report_id: report.id,
    report_type: report.type,
    organization_id: report.organizationId,
    reference: report.reference || '',
    description: report.description || '',
    category: report.category || '',
    location: report.location || '',
    item_profile: report.itemProfile || {},
    relevant_date: relevantDateOf(report),
    // The stored vectors are what let the Python scorer compute a REAL
    // SigLIP2 / BGE-M3 cosine instead of falling back to an attribute proxy.
    // Without these two fields every evidence row comes back model_backed=false
    // even though the models are installed and loaded.
    image_vector: Array.isArray(report.embedding) && report.embedding.length
      ? report.embedding : null,
    text_vector: Array.isArray(report.textEmbedding) && report.textEmbedding.length
      ? report.textEmbedding : null
  };
}

/** Loads plausible counterparts, always inside the report's own organization. */
async function loadCandidates(report) {
  const store = getDriver();
  const opposite = report.type === 'LOST' ? 'FOUND' : 'LOST';

  // organizationId comes from the stored report, not from the job payload.
  const { reports } = await store.listReports(report.organizationId, {
    type: opposite,
    limit: 300
  });

  const anchor = relevantDateOf(report);
  if (!anchor) return reports;

  const windowMs = config.matching.windowDays * DAY;
  const anchorTime = new Date(anchor).getTime();
  return reports.filter((candidate) => {
    const date = relevantDateOf(candidate);
    if (!date) return true;
    return Math.abs(new Date(date).getTime() - anchorTime) <= windowMs;
  });
}

function signalScore(outcome, signal) {
  const row = (outcome.evidence || []).find((e) => e.signal === signal);
  return row ? Number(row.score) || 0 : 0;
}

function statusFor(score) {
  return score >= config.matching.highConfidence ? 'PENDING_VERIFICATION' : 'MANUAL_REVIEW';
}

/** Persists one candidate from the AI result as a Match document. */
async function persistMatch(report, outcome) {
  const store = getDriver();
  const isLost = report.type === 'LOST';
  const lostReportId = isLost ? report.id : outcome.report_id;
  const foundReportId = isLost ? outcome.report_id : report.id;

  const evidence = (outcome.evidence || []).map((row) => ({
    signal: row.signal,
    label: row.label,
    score: row.score,
    weight: row.weight,
    contribution: row.contribution,
    detail: row.detail || '',
    // Preserved so the UI can tell a model measurement from a metadata proxy.
    modelBacked: Boolean(row.model_backed)
  }));

  const existing = await store.findMatchByReportPair(lostReportId, foundReportId);
  if (existing) {
    // Refresh the evidence but never re-notify for the same pair.
    return store.updateMatch(existing.id, {
      visualScore: signalScore(outcome, 'visual'),
      semanticScore: signalScore(outcome, 'semantic'),
      attributeScore: signalScore(outcome, 'attributes'),
      locationScore: signalScore(outcome, 'location'),
      timeScore: signalScore(outcome, 'time'),
      contextScore: signalScore(outcome, 'context'),
      finalScore: outcome.final_score,
      scores: outcome.scores || {},
      evidence,
      explanation: outcome.explanation || '',
      consistency: outcome.consistency || null,
      flags: outcome.flags || [],
      // A human rejection is not undone by a later automated re-score.
      status: existing.status === 'REJECTED' ? 'REJECTED' : statusFor(outcome.final_score)
    });
  }

  const match = await store.createMatch({
    organizationId: report.organizationId,
    lostReportId,
    foundReportId,
    visualScore: signalScore(outcome, 'visual'),
    semanticScore: signalScore(outcome, 'semantic'),
    attributeScore: signalScore(outcome, 'attributes'),
    locationScore: signalScore(outcome, 'location'),
    timeScore: signalScore(outcome, 'time'),
    contextScore: signalScore(outcome, 'context'),
    finalScore: outcome.final_score,
    scores: outcome.scores || {},
    weights: { ...config.matching.weights },
    evidence,
    explanation: outcome.explanation || '',
    // A flagged pair is still saved and still shown - hiding it would be worse
    // than showing it with the disagreement spelled out.
    consistency: outcome.consistency || null,
    flags: outcome.flags || [],
    status: statusFor(outcome.final_score),
    notified: false
  });
  // Staff watch the org match queue live: a new candidate has to appear there
  // without a refresh (the two parties get NEW_MATCH separately).
  realtime.publish(report.organizationId, {
    type: 'MATCH_UPDATE',
    payload: { action: 'created', matchId: match.id, reportId: report.id }
  });
  return match;
}

/** Notifies both parties and pushes a realtime event. */
async function notifyMatch(report, counterpartReport, match) {
  const lostOwner = report.type === 'LOST' ? report : counterpartReport;
  const foundOwner = report.type === 'LOST' ? counterpartReport : report;

  await notifications.notify(lostOwner.userId, report.organizationId, {
    type: notifications.TYPE.NEW_MATCH,
    title: 'Potential match found',
    message: `Your ${lostOwner.itemProfile?.itemName || lostOwner.category} may match a found item at ${counterpartReport.location}.`,
    referenceId: match.id,
    referenceType: 'MATCH',
    meta: { finalScore: match.finalScore, reportId: lostOwner.id }
  });

  await notifications.notify(foundOwner.userId, report.organizationId, {
    type: notifications.TYPE.NEW_MATCH,
    title: 'A lost report may match your find',
    message: `A ${lostOwner.itemProfile?.itemName || lostOwner.category} reported as lost at ${lostOwner.location} may be the item you found.`,
    referenceId: match.id,
    referenceType: 'MATCH',
    meta: { finalScore: match.finalScore, reportId: foundOwner.id }
  });

  await getDriver().updateMatch(match.id, { notified: true });

  realtime.emitToUser(lostOwner.userId, 'MATCH_CREATED', {
    matchId: match.id,
    finalScore: match.finalScore,
    reportId: lostOwner.id
  });
  realtime.emitToUser(foundOwner.userId, 'MATCH_CREATED', {
    matchId: match.id,
    finalScore: match.finalScore,
    reportId: foundOwner.id
  });
}

// ---------------------------------------------------------------------------
// job handler
// ---------------------------------------------------------------------------

/**
 * Runs matching for one report.
 *
 * Order matters: the report's own embeddings are (re)generated FIRST so the
 * Python service receives a query vector it can compare against the stored
 * candidate vectors. Without this the visual and semantic signals silently
 * degrade to attribute / keyword proxies.
 */
/**
 * One structured line per match run.
 *
 * Matching is asynchronous by design, so "why did this report get no matches?"
 * is otherwise unanswerable from the outside. Every terminal outcome - matched,
 * no candidates, no model, error - emits the same shape, which makes the log
 * greppable by reportId and gives the ops surface something honest to count
 * instead of a sentence that has to be parsed.
 */
function logRun(fields) {
  const line = { at: new Date().toISOString(), job: 'match:report', ...fields };
  // eslint-disable-next-line no-console
  console.log(`[aiWorker] match-run ${JSON.stringify(line)}`);
}

async function runMatchJob(envelope) {
  const startedAt = Date.now();
  let outcome;
  try {
    outcome = await _runMatchJob(envelope || {});
  } catch (err) {
    logRun({ reportId: envelope?.reportId || null, status: 'error', durationMs: Date.now() - startedAt, message: err.message });
    // A run that blew up must still free the report: MATCHING is transient and
    // nothing else will ever release it, so the case would be stuck forever.
    await settleParkedReport(envelope?.reportId, false, 'Match run failed - retry from the report page');
    throw err; // the queue driver still owns retry/backoff
  }
  logRun({ ...outcome, durationMs: Date.now() - startedAt });
  await settleParkedReport(outcome.reportId, outcome.created > 0);
  return outcome;
}

/**
 * Releases a report the worker parked at MATCHING, whatever the run did.
 * Warn-only: a status write failing must never turn a finished match run into a
 * failed job the queue will retry.
 */
async function settleParkedReport(reportId, matched, note) {
  if (!reportId) return;
  try {
    // eslint-disable-next-line global-require
    const reportService = require('./reportService');
    const report = await getDriver().findReportById(reportId);
    await reportService.settleMatching(report, { matched, note });
  } catch (err) {
    console.warn(`[aiWorker] could not settle report ${reportId} out of MATCHING: ${err.message}`);
  }
}

async function _runMatchJob({ reportId }) {
  const store = getDriver();
  const report = await store.findReportById(reportId);
  if (!report) {
    console.warn(`[aiWorker] report ${reportId} no longer exists - skipping`);
    return { reportId, reference: null, status: 'skipped', created: 0, reason: 'report-missing' };
  }

  // eslint-disable-next-line global-require
  const reportService = require('./reportService');

  // The user-visible meaning of MATCHING is "the AI is looking at this now".
  // Set it here, where the run actually starts, so the status on screen is
  // truthful and a lost job is detectable rather than invisible.
  await reportService.beginMatching(report).catch((err) => {
    console.warn(`[aiWorker] could not mark ${report.reference} as MATCHING: ${err.message}`);
  });

  try {
    await reportService.generateEmbeddings(report);
  } catch (err) {
    console.warn(`[aiWorker] embedding refresh failed for ${report.reference}: ${err.message}`);
  }

  const fresh = (await store.findReportById(reportId)) || report;
  const candidates = await loadCandidates(fresh);
  if (!candidates.length) {
    return { reportId: fresh.id, reference: fresh.reference, status: 'no-candidates', created: 0, candidates: 0, reason: 'no-candidates' };
  }

  const w = config.matching.weights;

  let result = null;
  if (await aiClient.hasRealModels()) {
    try {
      // The query vectors come from the report we just re-embedded, so the
      // Python scorer can compute real SigLIP2 / BGE-M3 cosines on BOTH sides
      // rather than only having vectors for the candidates.
      result = await aiClient.match({
        organization_id: fresh.organizationId,
        report_id: fresh.id,
        report_type: fresh.type,
        text: [fresh.itemProfile?.itemName, fresh.category, fresh.description]
          .filter(Boolean).join(' · '),
        description: fresh.description || '',
        category: fresh.category || '',
        location: fresh.location || '',
        item_profile: fresh.itemProfile || {},
        relevant_date: relevantDateOf(fresh),
        image_vector: Array.isArray(fresh.embedding) && fresh.embedding.length
          ? fresh.embedding : null,
        text_vector: Array.isArray(fresh.textEmbedding) && fresh.textEmbedding.length
          ? fresh.textEmbedding : null,
        candidates: candidates.map(toCandidate),
        weights: {
          visual: w.visual / 100, semantic: w.semantic / 100,
          attributes: w.attributes / 100, location: w.location / 100,
          time: w.time / 100, context: w.context / 100
        },
        top_n: config.matching.topN
      });
    } catch (err) {
      console.warn(`[aiWorker] pipeline match failed (${err.message}) - heuristic fallback`);
      result = null;
    }
  }

  // ---- model-backed path ----------------------------------------------
  if (result && Array.isArray(result.candidates) && result.candidates.length) {
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const created = [];
    for (const outcome of result.candidates) {
      if (outcome.final_score < config.matching.minScore) continue;
      const counterpart = byId.get(outcome.report_id);
      if (!counterpart) continue;
      // eslint-disable-next-line no-await-in-loop
      const match = await persistMatch(fresh, outcome);
      if (!match.notified) {
        // eslint-disable-next-line no-await-in-loop
        await notifyMatch(fresh, counterpart, match);
      }
      created.push(match);
    }
    console.log(`[aiWorker] ${fresh.reference}: ${created.length} model-backed match(es) `
      + `via ${result.analysis_version} degraded=${JSON.stringify(result.degraded_signals || [])}`);
    return {
      reportId: fresh.id,
      reference: fresh.reference,
      status: created.length ? 'matched' : 'below-threshold',
      created: created.length,
      candidates: candidates.length,
      considered: result.candidates.length,
      topScore: typeof result.candidates[0]?.final_score === 'number' ? result.candidates[0].final_score : null,
      source: 'pipeline',
      version: result.analysis_version,
      degraded: result.degraded_signals || []
    };
  }

  // ---- heuristic fallback ----------------------------------------------
  // eslint-disable-next-line global-require
  const matching = require('./matchingService');
  const createdHeuristic = await matching.findMatchesForReport(fresh.id);
  console.log(`[aiWorker] ${fresh.reference}: ${createdHeuristic.length} heuristic match(es) `
    + '(inference service unavailable)');
  return {
    reportId: fresh.id,
    reference: fresh.reference,
    status: createdHeuristic.length ? 'matched' : 'below-threshold',
    created: createdHeuristic.length,
    candidates: candidates.length,
    source: 'heuristic'
  };
}

/** Enqueue a match run. Idempotent, so it is safe to call on every edit. */
async function enqueueMatch(reportId) {
  const queue = await getQueue();
  return queue.add('match:report', { reportId }, { jobId: `match-${reportId}-${Date.now()}` });
}

/**
 * Registers the worker against the queue. Called once at boot.
 * Returns the queue mode so startup can log which driver is active.
 */
async function startWorker() {
  const queue = await getQueue();
  // Both drivers call the handler with the whole job ENVELOPE ({ id, name,
  // data }), not with the job's payload. Registering `runMatchJob` directly
  // therefore destructured `reportId` off the envelope, where it does not
  // exist: every auto-match job looked up report `undefined`, logged
  // "report undefined no longer exists - skipping" and quietly did nothing, so
  // a freshly filed report never got scanned unless someone pressed
  // "Re-run matching". Unwrap `data` here, where the driver contract is known.
  await queue.process('match:report', (job) => runMatchJob(job.data || job));
  console.log(`[aiWorker] handling "match:report" on the ${queue.mode} queue.`);
  return queue.mode;
}

module.exports = { runMatchJob, enqueueMatch, startWorker, loadCandidates, toCandidate };
