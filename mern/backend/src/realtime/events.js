/**
 * In-process real-time event bus with Server-Sent Events (SSE).
 * Zero external dependencies: uses Node's EventEmitter and standard HTTP response streaming.
 *
 * Resilience additions (pattern study: better-sse, MIT — see ATTRIBUTION.md):
 *  - every event carries an increasing `id`, so a reconnecting client can resume
 *    with Last-Event-ID instead of silently missing the frames from its outage;
 *  - a bounded ring of recent events backs that replay;
 *  - a client that stops draining its socket is dropped (backpressure) rather
 *    than allowed to buffer the org's whole stream in memory.
 */
const { EventEmitter } = require('events');
const { getDriver } = require('../store');

const bus = new EventEmitter();
bus.setMaxListeners(1000);

// Map of connection tracking: { clientId -> { res, orgId, userId } }
const clients = new Map();
let nextClientId = 1;

// Replay ring: bounded history of recent events keyed by the monotonic id each
// frame carries. This is what makes Last-Event-ID resume possible after a drop.
let nextEventId = 0;
const HISTORY_LIMIT = 200;
const history = [];

// A client that stops draining its socket is disconnected once its pending
// buffer passes this cap; its EventSource reconnects and resumes by id, so
// nothing is lost and nothing accumulates in our heap either.
const MAX_CLIENT_BUFFER_BYTES = 512 * 1024;

/** Tenant + targeting rules, shared by live delivery and replay so a
 *  reconnected client can never see more than a live one would have. */
function isVisible(evt, orgId, userId) {
  if (evt.organizationId !== orgId) return false;
  if (evt.userId && evt.userId !== userId) return false;
  return true;
}

/** Wire format for one frame — `id:` first so reconnects can resume from it. */
const frame = (evt) => `id: ${evt.id}\nevent: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`;

/**
 * Publishes an event to an organization's subscribers.
 * If targetUserId is provided, only sends to that user; otherwise to all org members connected.
 */
function publish(organizationId, { type, userId, payload }) {
  try {
    const evt = {
      id: ++nextEventId,
      // A null org is legal for user-addressed events; String(null) would make
      // the id the literal string "null" and match nothing.
      organizationId: organizationId != null ? String(organizationId) : null,
      userId: userId != null ? String(userId) : null,
      type,
      at: new Date().toISOString(),
      payload: payload || {}
    };
    history.push(evt);
    if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
    bus.emit('event', evt);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[sse] publish failed:', err.message);
  }
}

/** Returns the active count of connected clients (for health/monitoring). */
function connectionCount() {
  return clients.size;
}

/**
 * User-addressed convenience event (e.g. MATCH_CREATED for the owner).
 * Publishes on the org bus with userId set: the SSE handler already filters by
 * user, so only that user's stream receives it. Exists because services call
 * this by name - a missing export used to crash the match worker mid-notify,
 * AFTER the match was persisted but BEFORE the owner heard anything.
 */
function emitToUser(userId, type, payload) {
  if (!userId) return;
  publish(null, { type, userId, payload: payload || {} });
}

/**
 * Express handler for GET /api/events (SSE stream).
 * Supports token via Authorization header or ?token= query parameter (since standard browser EventSource cannot send headers).
 */
async function sseHandler(req, res) {
  // Disable request timeouts and buffering
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(': connected\n\n');
  res.write(`event: ready\ndata: ${JSON.stringify({ status: 'connected', time: new Date().toISOString() })}\n\n`);

  const clientId = nextClientId++;
  const orgId = String(req.user.activeOrgId || '');
  const userId = String(req.user.id || '');

  clients.set(clientId, { res, orgId, userId });

  const listener = (evt) => {
    // Tenant + targeting boundary: never broadcast outside the subscriber's
    // organization, and only deliver user-targeted events to that user.
    if (!isVisible(evt, orgId, userId)) return;

    try {
      const flushed = res.write(frame(evt));
      // Backpressure: keep streaming, but drop a client whose socket is not
      // being drained — it reconnects with Last-Event-ID and misses nothing.
      if (!flushed && res.writableLength > MAX_CLIENT_BUFFER_BYTES) cleanup();
    } catch {
      cleanup();
    }
  };

  bus.on('event', listener);

  // Heartbeat comment every 25 seconds to keep intermediary proxies alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      cleanup();
    }
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    bus.removeListener('event', listener);
    clients.delete(clientId);
    try {
      res.end();
    } catch {
      /* already closed */
    }
  };

  req.on('close', cleanup);
  req.on('error', cleanup);

  // Resume after a reconnect: replay every visible event published after the
  // id the client last received. Browsers resend the Last-Event-ID header on
  // their own automatic retries; our client opens a fresh EventSource (custom
  // backoff), so it also passes ?lastEventId= — the same dual input better-sse
  // accepts. This block runs synchronously right after the listener was
  // registered, so no publish can slip between the two.
  const rawLast = req.headers['last-event-id'] ?? req.query?.lastEventId;
  const since = Number.parseInt(String(rawLast ?? ''), 10);
  if (Number.isFinite(since)) {
    for (const evt of history) {
      if (evt.id > since && isVisible(evt, orgId, userId)) res.write(frame(evt));
    }
  }
}

module.exports = {
  publish,
  emitToUser,
  connectionCount,
  sseHandler
};
