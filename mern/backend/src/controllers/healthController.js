/**
 * Ops status surface.
 *
 * `/api/health` used to be a static `{"status":"ok"}` literal — true of the HTTP
 * listener and nothing else. A load balancer can use that; a human debugging
 * "matching is slow" or "notifications stopped" cannot. This reports what is
 * actually wired up right now, in one response:
 *
 *   store   - which driver is live (mongo / memory)
 *   queue   - driver, in-flight depth, completed/failed, jobs replayed on boot
 *   ai      - reachability, vector tier, per-provider state, endpoint timings
 *   mail    - which transport is active and whether it is configured
 *   storage - disk or S3-compatible bucket
 *
 * Public (no auth) on purpose: it is the container/uptime probe. It therefore
 * exposes capability and counters only — never a URI, a credential, a report, a
 * user or anything tenant-specific.
 */
const config = require('../config');
const { storeMode } = require('../store');
const { queueStats } = require('../services/aiQueue');
const aiClient = require('../services/aiClient');
const mailService = require('../services/mailService');
const { storageStatus } = require('../middleware/upload');

const startedAt = Date.now();

/** Trims a provider entry down to what an operator needs, dropping internals. */
const summariseProvider = (name, info) => ({
  name,
  status: info?.status || 'unknown',
  model: info?.model || null,
  loadSeconds: typeof info?.load_seconds === 'number' ? info.load_seconds : null,
  detail: info?.detail || null
});

async function health(req, res) {
  const force = String(req.query?.refresh || '') === '1' || String(req.query?.force || '') === '1';

  // Every probe is individually guarded: an ops endpoint that throws because one
  // dependency is down is worse than useless.
  const queue = await Promise.resolve()
    .then(() => queueStats())
    .catch((err) => ({ mode: 'error', error: err.message }));

  const ai = await aiClient.health({ force });
  const providers = ai.providers || {};
  const providerList = Object.entries(providers).map(([name, info]) => summariseProvider(name, info));
  const aiUnavailable = providerList.filter((p) => ['unavailable', 'not_installed'].includes(p.status));
  const aiReachable = ai.status !== 'unreachable';

  // Honest degradation ladder, worst first, so the top line always explains the
  // lowest status in the report below it.
  let degradedReason = null;
  if (!config.ai.enabled) degradedReason = 'AI_ENABLED=false: matching uses the built-in heuristic scorer';
  else if (!aiReachable) degradedReason = `AI service unreachable at ${config.ai.serviceUrl}`;
  else if (aiUnavailable.length) degradedReason = `Providers unavailable: ${aiUnavailable.map((p) => p.name).join(', ')}`;
  else if (!['qdrant', 'qdrant-local'].includes(ai.vector_store)) degradedReason = `Vector store is ${ai.vector_store} (not durable)`;

  const storage = storageStatus();
  const mail = mailService.mailStats();

  res.json({
    status: degradedReason ? 'degraded' : 'ok',
    degradedReason,
    service: 'LostLink AI API',
    version: '1.0.0',
    env: config.env,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    startedAt: new Date(startedAt).toISOString(),
    store: { mode: storeMode() },
    queue,
    ai: {
      enabled: config.ai.enabled,
      serviceUrl: config.ai.serviceUrl,
      reachable: aiReachable,
      status: ai.status || 'unknown',
      device: ai.device || null,
      vectorStore: ai.vector_store || 'none',
      durableVectorStore: ['qdrant', 'qdrant-local'].includes(ai.vector_store),
      providers: providerList,
      lazy: providerList.filter((p) => p.status === 'lazy').map((p) => p.name),
      unavailable: aiUnavailable.map((p) => p.name),
      // Which endpoints are slow, not just how many calls were made.
      timings: aiClient.timingStats()
    },
    mail,
    storage
  });
}

/**
 * Per-model inventory: checkpoint, loaded state, device, dimension.
 *
 * This is the endpoint an auditor reads to answer "which models are actually
 * installed, and which ones demonstrably compute?" - so it never returns a bare
 * "ready". With `?verify=1` the inference service runs one real micro-inference
 * per model and only then may a model be reported as `verified`, with the raw
 * result quoted back as evidence.
 */
async function models(req, res) {
  const verify = ['1', 'true', 'yes'].includes(String(req.query?.verify || '').toLowerCase());
  const inventory = await aiClient.modelInventory({ verify });
  const entries = Object.entries(inventory.models || {});

  res.json({
    ...inventory,
    summary: {
      // "verified" counts only models whose inference ran in THIS response.
      verified: entries.filter(([, m]) => m.verified === true).map(([name]) => name),
      loaded: entries.filter(([, m]) => m.loaded).map(([name]) => name),
      notConfigured: entries.filter(([, m]) => m.status === 'not_configured').map(([name]) => name),
      unavailable: entries.filter(([, m]) => m.status === 'unavailable').map(([name]) => name),
      total: entries.length
    }
  });
}

/**
 * Liveness only: never touches Mongo, Redis or the AI service, so a slow
 * dependency cannot mark a healthy process as dead and get it restarted.
 */
const live = (_req, res) => res.json({ status: 'ok', uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) });

module.exports = { health, models, live };
