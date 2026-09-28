/**
 * HTTP check for the recovery-board seed data.
 *
 *   node scripts/boardApiCheck.js
 *
 * Boots the real Express app on a scratch port (DATA_MODE=memory), signs in as a
 * member of ABC School and of XYZ Company, and asserts over the public API that
 * the ten board items per organization really come back with an image, a filled
 * itemProfile and the expected image URL that the browser will request.
 */
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.BOARD_PORT || 5097);
// Point this at an already-running backend (e.g. the dev server on :5000) and the
// script asserts against it instead of booting a scratch one.
const EXTERNAL = process.env.BOARD_BASE_URL || '';
const BASE = EXTERNAL || `http://127.0.0.1:${PORT}`;
const PASSWORD = 'lostlink123';

const EXPECTED = {
  'ABC School': { email: 'student@abcschool.com', items: ['Black Handbag', 'Blue Tablet', 'Silver Watch', 'Black Headphones', 'Black Sunglasses', 'Teal Water Bottle', 'Navy Track Pants', 'Silver Laptop Stand', 'Grey Wireless Mouse', 'Student ID Card'] },
  'XYZ Company': { email: 'employee@xyzcompany.com', items: ['Black Notebook', 'Green Umbrella', 'White Charger Brick', 'Brown Sunglasses', 'Orange Coffee Mug', 'Red Hoodie', 'Black Earbuds', 'Leather Notebook', 'Black Phone Pouch', 'White Laptop Charger'] }
};

let passed = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  // eslint-disable-next-line no-console
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
  if (ok) passed += 1;
  else failures.push(label);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, pathname, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${pathname}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function startServer() {
  return spawn(process.execPath, ['src/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATA_MODE: 'memory', PORT: String(PORT), AI_ENABLED: 'false', NODE_ENV: 'test', JWT_SECRET: 'board-check' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function waitUp() {
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(400);
  }
  return false;
}

(async () => {
  const server = EXTERNAL ? null : startServer();
  try {
    check('server booted', await waitUp());

    for (const [orgName, spec] of Object.entries(EXPECTED)) {
      /* eslint-disable no-await-in-loop */
      const login = await call('POST', '/api/auth/login', { body: { email: spec.email, password: PASSWORD } });
      check(`${orgName}: can sign in as ${spec.email}`, login.status === 200, `${login.status}`);
      const token = login.data.token;

      const list = await call('GET', '/api/reports?scope=all&limit=200', { token });
      const reports = list.data.reports || [];
      check(`${orgName}: GET /api/reports returns the board`, reports.length >= 20, `${reports.length} rows`);

      for (const itemName of spec.items) {
        const rows = reports.filter((r) => r.itemProfile?.itemName === itemName);
        const withImage = rows.find((r) => Array.isArray(r.images) && r.images[0]);
        const ok = rows.length >= 2 && Boolean(withImage);
        check(`${orgName}: "${itemName}" filed with a picture`, ok, withImage ? withImage.images[0] : `${rows.length} rows, no image`);
        if (withImage) {
          // The browser actually fetches that URL, so prove it is served.
          const img = await fetch(`${BASE}${withImage.images[0]}`);
          check(`${orgName}: "${itemName}" image is served`, img.status === 200 && /svg/.test(img.headers.get('content-type') || ''),
            `${img.status} ${img.headers.get('content-type')}`);
        }
      }

      const matches = await call('GET', '/api/matches?limit=200', { token });
      check(`${orgName}: GET /api/matches lists candidates`, (matches.data.matches || []).length >= 10,
        `${(matches.data.matches || []).length} rows`);

      const returns = await call('GET', '/api/returns', { token });
      const rows = returns.data.returns || [];
      check(`${orgName}: GET /api/returns lists the handovers`, rows.length >= 4, `${rows.length} rows`);
      check(`${orgName}: at least one return is ready for pickup`, rows.some((r) => r.status === 'READY'),
        rows.map((r) => r.status).join(','));
      /* eslint-enable no-await-in-loop */
    }
  } finally {
    server.kill();
  }

  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    // eslint-disable-next-line no-console
    console.error('FAILED:', failures.join('; '));
    process.exit(1);
  }
  process.exit(0);
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[boardApiCheck] crashed:', err);
  process.exit(1);
});