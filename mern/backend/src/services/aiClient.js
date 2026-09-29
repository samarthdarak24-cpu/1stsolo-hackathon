/**
 * Client for the Python inference service.
 *
 * Every ML model lives in `mern/ai-service`, so this file is the only place
 * the Node app knows about YOLO26 / SigLIP2 / BGE-M3 / Qwen3-VL.
 *
 * Failure policy: the inference service is OPTIONAL. When it is down or slow we
 * fall back to the built-in heuristic scorer in `matchingService.js` and record
 * which signals were skipped. A report must never fail to submit because a
 * model server is unavailable.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { AppError } = require('../utils/errors');

const UPLOAD_DIR = path.resolve(process.cwd(), config.uploads.dir);

let healthCache = { at: 0, value: null };
const HEALTH_TTL_MS = 15000;

/**
 * Per-endpoint latency rollup.
 *
 * A CPU-only inference host is the most likely thing to be slow, and "matching
 * feels slow" is unanswerable without numbers. Kept in memory, bounded by the
 * (small, fixed) set of endpoints, and exposed on /api/health so the ops screen
 * can show which call is the slow one without a metrics stack.
 */
const timings = new Map();

function recordTiming(pathname, ms, ok) {
  const entry = timings.get(pathname) || {
    endpoint: pathname,
    calls: 0,
    errors: 0,
    totalMs: 0,
    maxMs: 0,
    lastMs: 0,
    lastAt: null
  };
  entry.calls += 1;
  if (!ok) entry.errors += 1;
  entry.totalMs += ms;
  entry.maxMs = Math.max(entry.maxMs, ms);
  entry.lastMs = ms;
  entry.lastAt = new Date().toISOString();
  timings.set(pathname, entry);
}

/** Round-trip stats per AI endpoint, slowest first. */
function timingStats() {
  return [...timings.values()]
    .map((e) => ({
      endpoint: e.endpoint,
      calls: e.calls,
      errors: e.errors,
      avgMs: Math.round(e.totalMs / e.calls),
      maxMs: e.maxMs,
      lastMs: e.lastMs,
      lastAt: e.lastAt
    }))
    .sort((a, b) => b.avgMs - a.avgMs);
}

/** Injected in tests; defaults to global fetch (Node 18+). */
const doFetch = (...args) => fetch(...args);

async function request(pathname, { method = 'GET', body, form, timeout } = {}) {
  if (!config.ai.enabled) {
    throw new AppError(503, 'AI services are disabled on this server');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout || config.ai.timeoutMs);
  const startedAt = Date.now();
  let ok = false;

  try {
    const init = { method, signal: controller.signal };
    if (form) {
      init.body = form; // fetch sets the multipart boundary itself
    } else if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }

    const response = await doFetch(`${config.ai.serviceUrl}${pathname}`, init);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new AppError(
        response.status === 503 ? 503 : 502,
        data.detail || data.message || `AI service returned ${response.status}`
      );
      error.aiUnavailable = true;
      throw error;
    }
    ok = true;
    return data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const aborted = err.name === 'AbortError';
    const error = new AppError(
      503,
      aborted
        ? 'The AI service took too long to respond.'
        : 'The AI service is unreachable.'
    );
    error.aiUnavailable = true;
    throw error;
  } finally {
    clearTimeout(timer);
    recordTiming(pathname, Date.now() - startedAt, ok);
  }
}

/** Resolves a stored /uploads path to bytes the Python service can read. */
function readImageBytes(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  // Keep the URL's relative shape (including subdirectories such as items/):
  // path.basename() here turned /uploads/items/x.svg into uploads/x.svg, so
  // every seeded artwork silently failed to embed. Only the leading /uploads
  // prefix is stripped, and the resolved path must stay inside UPLOAD_DIR.
  let relative;
  try {
    relative = decodeURIComponent(imageUrl).replace(/^\/uploads\//, '').replace(/^uploads\//, '');
  } catch {
    return null;
  }
  const full = path.resolve(UPLOAD_DIR, relative);
  const uploadRoot = `${path.resolve(UPLOAD_DIR)}${path.sep}`;
  if (!full.startsWith(uploadRoot)) return null;
  try {
    return fs.readFileSync(full);
  } catch {
    return null;
  }
}

/** Live capability report from the Python service, cached briefly. */
async function health({ force = false } = {}) {
  if (!force && healthCache.value && Date.now() - healthCache.at < HEALTH_TTL_MS) {
    return healthCache.value;
  }
  try {
    const value = await request('/health', { timeout: 4000 });
    healthCache = { at: Date.now(), value };
    return value;
  } catch {
    healthCache = {
      at: Date.now(),
      value: {
        status: 'unreachable',
        service: 'LostLink AI Inference Service',
        device: null,
        providers: {},
        vector_store: 'none'
      }
    };
    return healthCache.value;
  }
}

/**
 * Per-model inventory from the inference service.
 *
 * `verify` makes the Python side run one real micro-inference per model, which
 * is the only way to tell "the checkpoint is on disk" apart from "this model
 * actually computes". It costs a model load, so it is opt-in and never cached.
 * An unreachable service returns an explicit unreachable snapshot rather than
 * throwing: the ops screen must still render.
 */
async function modelInventory({ verify = false } = {}) {
  const pathname = verify ? '/health/models?verify=1' : '/health/models';
  try {
    return await request(pathname, { timeout: verify ? 300000 : 6000 });
  } catch (err) {
    return {
      service: 'LostLink AI Inference Service',
      device: null,
      verified_now: false,
      models: {},
      vector_store: { status: 'unreachable', checkpoint: 'none', detail: err.message },
      verified: [],
      error: err.message
    };
  }
}

/** True when at least one real model is loaded/loadable. */
async function hasRealModels() {
  const report = await health();
  return Object.values(report.providers || {}).some(
    (p) => p.status === 'ready' || p.status === 'lazy'
  );
}

/**
 * Structured item analysis. Multipart because the image can be several MB and
 * base64 would inflate it by a third.
 */
async function analyzeItem({ imagePath, filename, reportType, hints }) {
  const form = new FormData();
  if (Buffer.isBuffer(imagePath)) {
    form.append('file', new Blob([imagePath]), filename || 'upload.jpg');
  } else if (imagePath && fs.existsSync(imagePath)) {
    const buffer = fs.readFileSync(imagePath);
    form.append('file', new Blob([buffer], { type: guessMime(imagePath) }), filename || 'upload.jpg');
  } else {
    throw new AppError(400, 'An image file is required for analysis');
  }
  form.append('report_type', reportType === 'FOUND' ? 'FOUND' : 'LOST');
  form.append('hints', JSON.stringify(hints || {}));
  return request('/analyze-item', { method: 'POST', form });
}

/**
 * Run the full matching pipeline.
 *
 * `candidates` come from Mongo (this process owns the database), so the
 * Python service never needs DB credentials or schema knowledge.
 */
function match(payload) {
  return request('/match', { method: 'POST', body: payload });
}

function rerank(payload) {
  return request('/rerank', { method: 'POST', body: payload });
}

function explain(payload) {
  return request('/explain', { method: 'POST', body: payload });
}

function cctvAnalyze(payload) {
  return request('/cctv/analyze', { method: 'POST', body: payload, timeout: 300000 });
}

/**
 * SigLIP2 visual embedding for one image (768-dim, L2-normalised).
 * Accepts a Buffer of image bytes or a path inside the uploads dir.
 */
function embedImage({ buffer, path: filePath }) {
  let bytes = buffer;
  if (!bytes && filePath) bytes = readImageBytes(filePath);
  if (!bytes) throw new AppError(400, 'Image bytes are required to build a visual embedding');
  return request('/embed/image', {
    method: 'POST',
    // The service accepts base64 in JSON; it sniffs the magic bytes itself.
    body: { image_bytes: bytes.toString('base64'), modality: 'image' }
  });
}

/** BGE-M3 text embeddings for a batch of strings (1024-dim). */
function embedTexts(texts) {
  const list = (Array.isArray(texts) ? texts : [texts]).filter(t => typeof t === 'string' && t.trim());
  if (!list.length) return Promise.resolve({ vectors: [] });
  return request('/embed/text', { method: 'POST', body: { texts: list, modality: 'text' } });
}

/** Convenience: one text string -> one vector (or null). */
async function embedText(text) {
  const res = await embedTexts([text]);
  return res?.vectors?.[0] || null;
}

/** Forgets the cached health so the ops screen can force a refresh. */
function resetHealthCache() {
  healthCache = { at: 0, value: null };
}

function guessMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

const PROVIDER_LABELS = {
  detector: 'Object detection (YOLO26n)',
  siglip: 'Visual embedding (SigLIP2)',
  bge_m3: 'Text embedding (BGE-M3)',
  reranker: 'Reranking (BGE-reranker-v2-m3)',
  ocr: 'Text extraction (PaddleOCR)',
  vlm: 'Item understanding (Qwen3-VL)'
};

/** Presentable summary for the UI's AI status panel. */
async function describe() {
  const report = await health();
  const providers = report.providers || {};
  return {
    reachable: report.status !== 'unreachable',
    serviceStatus: report.status,
    device: report.device,
    vectorStore: report.vector_store,
    realModels: Object.values(providers).some(
      (p) => p.status === 'ready' || p.status === 'lazy'
    ),
    providers: Object.entries(providers).map(([name, info]) => ({
      name,
      label: PROVIDER_LABELS[name] || name,
      status: info.status,
      model: info.model,
      detail: info.detail,
      loadSeconds: info.load_seconds
    })),
    notice: describeDegradation(report)
  };
}

/** Plain-language statement of what the AI layer can and cannot do right now. */
function describeDegradation(report) {
  if (report.status === 'unreachable') {
    return 'The AI service is not running. Matching falls back to the built-in heuristic scorer, so visual and semantic signals are unavailable.';
  }
  const down = Object.values(report.providers || {}).filter(
    (p) => p.status === 'unavailable' || p.status === 'not_installed'
  );
  if (!down.length) {
    return report.vector_store === 'qdrant'
      ? 'All models are available and the vector store is connected.'
      : 'All models are available. The vector store is running in memory, so vectors are lost when the AI service restarts.';
  }
  return `Unavailable: ${down
    .map((p) => PROVIDER_LABELS[p.name] || p.name)
    .join(', ')}. Matching continues with the remaining signals.`;
}

module.exports = {
  request,
  health,
  modelInventory,
  hasRealModels,
  analyzeItem,
  match,
  rerank,
  explain,
  cctvAnalyze,
  embedImage,
  embedText,
  embedTexts,
  describe,
  readImageBytes,
  resetHealthCache,
  guessMime,
  timingStats
};

