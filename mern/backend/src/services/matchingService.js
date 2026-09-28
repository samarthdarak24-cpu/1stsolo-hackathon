/**
 * Matching service — multi-signal candidate ranking.
 *
 * Signals (weights are configurable via env, see config.matching.weights):
 *   visual 35% | semantic 20% | attributes 15% | location 10% | time 10% | context 10%
 *
 * Honest capability notes:
 *  - A real visual embedding is used when both reports carry one (cosine over the
 *    stored vector). Without embeddings the visual signal degrades to an
 *    attribute-based proxy and is labelled as such in the evidence row.
 *  - Location uses haversine distance when coordinates exist, otherwise string
 *    similarity of the free-text location.
 *  - These scores rank candidates for human review. They are not proof of
 *    ownership and the API never claims otherwise.
 */
const config = require('../config');
const { getDriver } = require('../store');
const notificationService = require('./notificationService');
const realtime = require('../realtime/events');

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do', 'does', 'did', 'doing',
  'have', 'has', 'had', 'having', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she',
  'it', 'its', 'they', 'them', 'their', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'can', 'will', 'just', 'should', 'now', 'found', 'lost', 'item', 'items',
  'left', 'keep', 'kept', 'please', 'someone', 'somewhere', 'around', 'near', 'report'
]);

const normalise = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();

const tokenize = (text) => normalise(text)
  .split(/\s+/)
  .filter(t => t.length > 1 && !STOPWORDS.has(t))
  .map(t => t.replace(/(ing|ers|ed|es|s)$/, ''))
  .filter(Boolean);

const termFrequency = (tokens) => tokens.reduce((acc, t) => {
  acc[t] = (acc[t] || 0) + 1;
  return acc;
}, {});

/** Weighted token-overlap similarity in [0,1]; rare shared terms count more. */
function textSimilarity(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;

  const fa = termFrequency(ta);
  const fb = termFrequency(tb);
  const vocab = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  let shared = 0;
  let total = 0;

  for (const term of vocab) {
    const weight = 1 / (1 + Math.log(1 + (fa[term] || 0) + (fb[term] || 0)));
    total += weight;
    if ((fa[term] || 0) && (fb[term] || 0)) shared += weight;
  }
  return total ? shared / total : 0;
}

const haversineKm = (a, b) => {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Cosine similarity over two numeric vectors, or null when either is absent. */
function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 8 || a.length !== b.length) return null;
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const same = (a, b) => Boolean(a) && Boolean(b) && norm(a) === norm(b);
const overlap = (a, b) => {
  const x = norm(a); const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  const xs = new Set(tokenize(a));
  const ys = new Set(tokenize(b));
  if (!xs.size || !ys.size) return 0;
  let shared = 0;
  xs.forEach(t => { if (ys.has(t)) shared += 1; });
  return shared / Math.max(xs.size, ys.size);
};

const reportText = (report) => [
  report.description,
  report.itemProfile?.itemName,
  report.itemProfile?.visibleMark,
  report.itemProfile?.ocrText,
  report.itemProfile?.finderNotes
].filter(Boolean).join(' ');

const eventDate = (report) => new Date(report.lostAt || report.foundAt || report.createdAt || 0).getTime();

/* ------------------------------------------------------------------ */
/* Individual signals                                                  */
/* ------------------------------------------------------------------ */

function visualSignal(lost, found) {
  const embedding = cosine(lost.embedding, found.embedding);
  if (embedding != null) {
    return { score: Math.round(Math.max(0, Math.min(1, embedding)) * 100), source: 'embedding' };
  }
  // No embeddings available: approximate from the structured visual attributes.
  // Fields that are empty on BOTH sides carry no information, so they are excluded
  // from the average instead of counting as a mismatch.
  const lp = lost.itemProfile || {};
  const fp = found.itemProfile || {};
  const pairs = [
    [lp.primaryColor, fp.primaryColor, 1],
    [lp.brand, fp.brand, 1],
    [lp.shape, fp.shape, 1],
    [lp.visibleMark, fp.visibleMark, 1],
    [lp.secondaryColor, fp.secondaryColor, 0.5],
    [lp.model, fp.model, 0.5]
  ].filter(([a, b]) => a || b);

  if (!pairs.length) return { score: 0, source: 'attribute-proxy' };
  const total = pairs.reduce((acc, [a, b, w]) => acc + overlap(a, b) * w, 0);
  const possible = pairs.reduce((acc, [, , w]) => acc + w, 0);
  return { score: Math.round((total / possible) * 100), source: 'attribute-proxy' };
}

function attributeSignal(lost, found) {
  const lp = lost.itemProfile || {};
  const fp = found.itemProfile || {};
  const checks = [
    ['primaryColor', overlap(lp.primaryColor, fp.primaryColor), 1.4],
    ['brand', same(lp.brand, fp.brand) ? 1 : overlap(lp.brand, fp.brand), 1.6],
    ['model', same(lp.model, fp.model) ? 1 : overlap(lp.model, fp.model), 1.2],
    ['shape', same(lp.shape, fp.shape) ? 1 : overlap(lp.shape, fp.shape), 0.8],
    ['material', same(lp.material, fp.material) ? 1 : overlap(lp.material, fp.material), 0.9],
    ['serialNumber', same(lp.serialNumber, fp.serialNumber) ? 1 : 0, 2.5],
    ['visibleMark', overlap(lp.visibleMark, fp.visibleMark), 1.1],
    ['size', same(lp.size, fp.size) ? 1 : 0, 0.6]
  ].filter(([key]) => (lp[key] || fp[key]));

  if (!checks.length) return 0;
  let weighted = 0;
  let possible = 0;
  for (const [, value, weight] of checks) {
    weighted += (value || 0) * weight;
    possible += weight;
  }
  return possible ? Math.round((weighted / possible) * 100) : 0;
}

function categorySignal(lost, found) {
  const a = lost.itemProfile?.category || lost.category;
  const b = found.itemProfile?.category || found.category;
  if (!a || !b) return 0;
  return same(a, b) ? 100 : Math.round(overlap(a, b) * 70);
}

function locationSignal(lost, found) {
  const km = haversineKm(lost.coordinates, found.coordinates);
  if (km != null) {
    if (km <= 0.1) return 100;
    if (km <= 0.5) return 88;
    if (km <= 2) return 72;
    if (km <= 10) return 48;
    return 15;
  }
  const value = overlap(lost.location, found.location);
  if (same(lost.location, found.location)) return 100;
  if (value > 0.5) return 78;
  if (value > 0) return 52;
  return 18;
}

function timeSignal(lost, found) {
  const deltaDays = Math.abs(eventDate(lost) - eventDate(found)) / 86400000;
  if (deltaDays <= 0.042) return 100;          // within the hour
  if (deltaDays <= 1) return 92;
  if (deltaDays <= 3) return 78;
  if (deltaDays <= 7) return 58;
  if (deltaDays <= config.matching.windowDays) return 34;
  return 0;
}

const contextSignal = (lost, found) => {
  const sim = textSimilarity(reportText(lost), reportText(found));
  const landmark = overlap(lost.lastSeen?.landmark, found.lastSeen?.landmark);
  return Math.round(Math.min(100, sim * 85 + landmark * 15));
};

const strengthLabel = (score) => {
  if (score >= 90) return 'Exact';
  if (score >= 75) return 'Strong';
  if (score >= 55) return 'Likely';
  if (score >= 35) return 'Weak';
  return 'Mismatch';
};

/* ------------------------------------------------------------------ */
/* Fusion                                                              */
/* ------------------------------------------------------------------ */

/**
 * Semantic similarity. Prefers the real BGE-M3 text embeddings when both reports
 * carry them (cosine over the stored vectors) and falls back to lexical overlap
 * otherwise. The source is reported so the UI never presents a token-overlap
 * guess as a model result.
 */
function semanticSignal(lost, found) {
  const embedded = cosine(lost.textEmbedding, found.textEmbedding);
  if (embedded != null) {
    // BGE-M3 cosine on related descriptions sits around 0.6-0.9; rescale so a
    // strong match reads as a strong score instead of a permanent 70%.
    const scaled = Math.max(0, Math.min(1, (embedded - 0.35) / 0.55));
    return { score: Math.round(scaled * 100), source: 'bge-m3' };
  }
  return { score: Math.round(textSimilarity(reportText(lost), reportText(found)) * 100), source: 'lexical' };
}

function scorePair(lost, found) {
  const visual = visualSignal(lost, found);
  const semantic = semanticSignal(lost, found);
  const attributes = attributeSignal(lost, found);
  const category = categorySignal(lost, found);
  const location = locationSignal(lost, found);
  const time = timeSignal(lost, found);
  const context = contextSignal(lost, found);

  const w = config.matching.weights;
  const weighted = {
    visual: visual.score * w.visual,
    semantic: semantic.score * w.semantic,
    attributes: attributes * w.attributes,
    location: location * w.location,
    time: time * w.time,
    context: context * w.context
  };
  const totalWeight = w.visual + w.semantic + w.attributes + w.location + w.time + w.context;
  const finalScore = Math.round((Object.values(weighted).reduce((a, b) => a + b, 0) / totalWeight) * 10) / 10;

  const dayGap = Math.abs(eventDate(lost) - eventDate(found)) / 86400000;
  const km = haversineKm(lost.coordinates, found.coordinates);

  const evidence = [
    { key: 'visual', label: 'Visual similarity', score: visual.score, strength: strengthLabel(visual.score), source: visual.source, weight: w.visual },
    { key: 'semantic', label: 'Description similarity', score: semantic.score, strength: strengthLabel(semantic.score), source: semantic.source, weight: w.semantic },
    { key: 'attributes', label: 'Attribute match', score: attributes, strength: strengthLabel(attributes), weight: w.attributes },
    { key: 'category', label: 'Category', score: category, strength: strengthLabel(category), weight: 0 },
    { key: 'location', label: 'Location', score: location, strength: strengthLabel(location), detail: km != null ? `${km.toFixed(2)} km apart` : `${lost.location} vs ${found.location}`, weight: w.location },
    { key: 'time', label: 'Timing', score: time, strength: strengthLabel(time), detail: dayGap < 1 ? 'Within the same day' : `${Math.round(dayGap)} day gap`, weight: w.time },
    { key: 'context', label: 'Context', score: context, strength: strengthLabel(context), weight: w.context }
  ];

  const strongest = [...evidence].filter(e => e.weight > 0).sort((a, b) => b.score * b.weight - a.score * a.weight);
  const explanation = buildExplanation({ finalScore, strongest, lost, found });

  return {
    visualScore: visual.score,
    semanticScore: semantic.score,
    attributeScore: attributes,
    categoryScore: category,
    locationScore: location,
    timeScore: time,
    contextScore: context,
    finalScore,
    scores: {
      visual: visual.score, semantic: semantic.score, attributes, category, location, time, context,
      visualSource: visual.source
    },
    weights: w,
    evidence,
    explanation
  };
}

function buildExplanation({ finalScore, strongest, lost, found }) {
  const lp = lost.itemProfile || {};
  const fp = found.itemProfile || {};
  const top = strongest.slice(0, 3).map(e => `${e.label.toLowerCase()} (${e.score}%)`);
  const name = lp.itemName || lost.category || 'item';
  const foundName = fp.itemName || found.category || 'item';

  if (finalScore >= config.matching.highConfidence) {
    return `High confidence candidate. The reported ${name} and the ${foundName} share ${top.join(', ')}. `
      + 'This is a candidate recommendation for human review, not proof of ownership.';
  }
  if (finalScore >= config.matching.minScore) {
    return `Possible match. The reported ${name} and the ${foundName} share ${top.join(', ')}, `
      + 'but some signals are weak. Review the evidence before starting verification.';
  }
  return `Weak match. The reported ${name} and the ${foundName} differ on most signals.`;
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

const relevantDate = (report) => new Date(report.lostAt || report.foundAt || report.createdAt || 0);

/**
 * Scores a report against every opposite-type report in the organization,
 * persists new candidates, and notifies the counterparties exactly once.
 */
async function findMatchesForReport(reportId) {
  const store = getDriver();
  const report = await store.findReportById(reportId);
  if (!report) return [];

  const oppositeType = report.type === 'LOST' ? 'FOUND' : 'LOST';
  const { reports: candidates } = await store.listReports(report.organizationId, { type: oppositeType, limit: 300 });
  const windowMs = config.matching.windowDays * 86400000;
  const anchor = relevantDate(report).getTime();

  const scored = candidates
    .map(candidate => ({ candidate, delta: Math.abs(anchor - relevantDate(candidate).getTime()) }))
    .filter(c => c.delta <= windowMs)
    .map(c => ({ candidate: c.candidate, result: scorePair(report, c.candidate) }))
    .filter(c => c.result.finalScore >= config.matching.minScore)
    .sort((a, b) => b.result.finalScore - a.result.finalScore)
    .slice(0, config.matching.topN);

  const created = [];
  for (const { candidate, result } of scored) {
    const lostReport = report.type === 'LOST' ? report : candidate;
    const foundReport = report.type === 'FOUND' ? report : candidate;
    const existing = await store.findMatchByReportPair(lostReport.id, foundReport.id);
    if (existing) {
      // Refresh scores but never re-notify for the same pair.
      // eslint-disable-next-line no-await-in-loop
      await store.updateMatch(existing.id, { ...result, notified: true });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const match = await store.createMatch({
      organizationId: report.organizationId,
      lostReportId: lostReport.id,
      foundReportId: foundReport.id,
      ...result,
      status: result.finalScore >= config.matching.highConfidence ? 'PENDING_VERIFICATION' : 'MANUAL_REVIEW',
      notified: false
    });
    created.push(match);
    // The parties already get NEW_MATCH through the notification; this is for
    // everyone else watching the org match queue (staff screens).
    realtime.publish(report.organizationId, {
      type: 'MATCH_UPDATE',
      payload: { action: 'created', matchId: match.id, reportId: report.id }
    });

    if (result.finalScore >= config.matching.minScore) {
      // eslint-disable-next-line no-await-in-loop
      await notificationService.notify(lostReport.userId, report.organizationId, {
        type: notificationService.TYPE.NEW_MATCH,
        title: 'Potential match found',
        message: `Your ${lostReport.itemProfile?.itemName || lostReport.category} may match a ${foundReport.type === 'FOUND' ? 'found' : 'reported'} item at ${foundReport.location}.`,
        referenceId: match.id,
        referenceType: 'MATCH',
        meta: { finalScore: result.finalScore, reportId: lostReport.id }
      });
      // eslint-disable-next-line no-await-in-loop
      await notificationService.notify(foundReport.userId, report.organizationId, {
        type: notificationService.TYPE.NEW_MATCH,
        title: 'A lost report may match your find',
        message: `A ${lostReport.itemProfile?.itemName || lostReport.category} reported as lost at ${lostReport.location} may be the item you found.`,
        referenceId: match.id,
        referenceType: 'MATCH',
        meta: { finalScore: result.finalScore, reportId: foundReport.id }
      });
      // eslint-disable-next-line no-await-in-loop
      await store.updateMatch(match.id, { notified: true });
    }

    if (lostReport.id !== report.id) {
      // eslint-disable-next-line no-await-in-loop
      await store.updateReport(lostReport.id, { status: 'POTENTIAL_MATCH' });
    }
    if (foundReport.id !== report.id) {
      // eslint-disable-next-line no-await-in-loop
      await store.updateReport(foundReport.id, { status: 'MATCHED' });
    }
  }

  return created;
}

/** Fire-and-forget entry point used after report creation / update. */
function triggerMatching(reportId) {
  setImmediate(() => {
    findMatchesForReport(reportId).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[matching] background run failed:', err.message);
    });
  });
}

module.exports = {
  scorePair,
  findMatchesForReport,
  triggerMatching,
  textSimilarity,
  cosine,
  haversineKm,
  strengthLabel
};
