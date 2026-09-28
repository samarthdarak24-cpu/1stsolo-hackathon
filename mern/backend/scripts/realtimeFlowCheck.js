/**
 * Live realtime flow check — boots the REAL server and proves the whole loop
 * behind every "updates without a refresh" screen in the app:
 *
 *   service mutation -> realtime.publish -> SSE stream -> client frame
 *   disconnect -> mutation while offline -> reconnect with ?lastEventId= -> replay
 *
 * Complements scripts/sseCheck.js (pure event-bus mechanics) by running the
 * publish path from the actual HTTP handlers against a live server.
 *
 * Run from mern/backend:   node scripts/realtimeFlowCheck.js
 * Exit code 0 only when every check passed.
 */
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PORT = Number(process.env.REALTIME_PORT || 5063);
const BASE = `http://127.0.0.1:${PORT}`;
const BOOT_TIMEOUT_MS = 40000;
const PASSWORD = 'lostlink123';
const ADMIN = 'admin@abcschool.com';

let passed = 0;
const failures = [];

function check(label, ok, detail = '') {
  const suffix = detail ? ` - ${detail}` : '';
  if (ok) {
    passed += 1;
    console.log(`  ok  ${label}${suffix}`);
  } else {
    failures.push(label);
    console.log(`FAIL  ${label}${suffix}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, pathname, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function waitForServer() {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(400);
  }
  return false;
}

function startServer() {
  const cwd = path.resolve(__dirname, '..');
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd,
    env: {
      ...process.env,
      DATA_MODE: 'memory',
      PORT: String(PORT),
      AI_ENABLED: 'false',
      NODE_ENV: 'test',
      JWT_SECRET: 'realtime-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const log = [];
  child.stdout.on('data', (d) => log.push(String(d).trim()));
  child.stderr.on('data', (d) => log.push(String(d).trim()));
  return { child, log };
}

/** Minimal SSE client: parses frames, supports the resume cursor. */
function openSse(token, lastEventId) {
  const frames = [];
  const url = `/api/events?token=${encodeURIComponent(token)}`
    + (lastEventId ? `&lastEventId=${encodeURIComponent(lastEventId)}` : '');
  let buf = '';

  const req = http.get(`${BASE}${url}`, (res) => {
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const frame = { id: null, event: null, data: null };
        for (const line of raw.split('\n')) {
          if (line.startsWith('id: ')) frame.id = Number(line.slice(4));
          else if (line.startsWith('event: ')) frame.event = line.slice(7);
          else if (line.startsWith('data: ')) {
            try { frame.data = JSON.parse(line.slice(6)); } catch { /* ignore */ }
          }
        }
        if (frame.event) frames.push(frame);
      }
    });
  });
  req.on('error', () => { /* closed */ });

  return {
    frames,
    async waitFor(predicate, ms = 8000) {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const hit = frames.find(predicate);
        if (hit) return hit;
        await sleep(100);
      }
      return null;
    },
    lastId() {
      return frames.reduce((max, f) => (Number.isFinite(f.id) ? Math.max(max, f.id) : max), 0);
    },
    close() { req.destroy(); }
  };
}

function fileReport(token, name) {
  return call('POST', '/api/reports/lost', {
    token,
    body: {
      itemProfile: { itemName: name, category: 'Personal', primaryColor: 'Grey' },
      category: 'Personal',
      description: `${name} — realtime flow check report for the live event loop.`,
      location: 'Library Foyer',
      lostAt: new Date(Date.now() - 600_000).toISOString()
    }
  });
}

async function main() {
  const { child, log } = startServer();
  const stop = () => { try { child.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  try {
    const up = await waitForServer();
    check('the API boots', up, up ? BASE : log.slice(-6).join(' | '));
    if (!up) throw new Error('server did not start');

    const admin = await call('POST', '/api/auth/login', {
      body: { email: ADMIN, password: PASSWORD }
    });
    check('the admin signs in', admin.status === 200 && Boolean(admin.data?.token), `${admin.status}`);
    const token = admin.data.token;

    // ---- 1. live delivery -------------------------------------------------
    const sse = openSse(token);
    const ready = await sse.waitFor((f) => f.event === 'ready');
    check('the event stream connects', Boolean(ready));

    const report1 = await fileReport(token, 'Realtime One');
    check('the first report is filed', report1.status === 201, `${report1.status}`);
    const id1 = report1.data?.report?.id;

    const live1 = await sse.waitFor(
      (f) => f.event === 'REPORT_UPDATE' && f.data?.payload?.reportId === id1
    );
    check('the live mutation reaches the connected stream', Boolean(live1),
      live1 ? `frame id ${live1.id}` : `got: ${sse.frames.map((f) => f.event).join(', ') || 'nothing'}`);

    const numericIds = sse.frames.map((f) => f.id).filter(Number.isFinite);
    check('every frame id is strictly greater than the last',
      numericIds.every((v, i) => i === 0 || numericIds[i - 1] < v),
      numericIds.join(' -> '));

    // ---- 2. offline gap + resume ----------------------------------------
    const cursor = String(sse.lastId());
    sse.close();
    await sleep(200);

    const report2 = await fileReport(token, 'Realtime Two');
    check('a second report is filed while the client is offline', report2.status === 201, `${report2.status}`);
    const id2 = report2.data?.report?.id;
    await sleep(400); // let background work publish into the replay ring

    const sse2 = openSse(token, cursor);
    const replayed = await sse2.waitFor(
      (f) => f.event === 'REPORT_UPDATE' && f.data?.payload?.reportId === id2
    );
    check('the missed event is replayed on resume', Boolean(replayed),
      replayed ? `frame id ${replayed.id}` : `got: ${sse2.frames.map((f) => f.event).join(', ') || 'nothing'}`);

    const reAcked = sse2.frames.some(
      (f) => f.data?.payload?.reportId === id1 && f.data?.payload?.action === 'created'
    );
    check('acknowledged events are never re-sent', !reAcked);
    sse2.close();
  } finally {
    stop();
  }

  const total = passed + failures.length;
  console.log(`\n${passed}/${total} checks passed`);
  if (failures.length) console.log(`failed: ${failures.join(' | ')}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`[realtimeFlow] fatal: ${err.message}`);
  process.exit(1);
});
