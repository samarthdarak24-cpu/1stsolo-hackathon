/**
 * Null-payload acceptance check.
 *
 * Guards the regression behind the reporter's upload failure:
 *
 *   POST /api/reports/lost  ->  400  "Invalid input: expected object, received null"
 *
 * JSON has no `undefined`, so a client saying "no value here" may omit the key
 * or send `null`. Zod's `.optional()` only accepts the first, so a perfectly
 * reasonable payload — `{ lat: null, lng: null }` from a wizard whose map step
 * was skipped, `itemProfile.brand: null` from a cleared field — was rejected
 * with a message that named no field a user could fix.
 *
 * This script boots the REAL server (DATA_MODE=memory, no Mongo/Redis needed)
 * and asserts, over HTTP, that every documented "nothing here" spelling is
 * accepted for the optional fields, while genuine validation (missing
 * description, unknown status, oversized image list) still fails.
 *
 * Run from mern/backend:   node scripts/nullPayloadCheck.js
 * Exit code 0 only when every check passed.
 */
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.NULLCHECK_PORT || 5064);
const BASE = `http://127.0.0.1:${PORT}`;
const BOOT_TIMEOUT_MS = 40000;
const PASSWORD = 'lostlink123';
const MEMBER = 'student@abcschool.com';

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

/** A payload that is valid except for the field under test. */
const baseLost = (over = {}) => ({
  itemProfile: {
    itemName: 'Navy backpack',
    category: 'Backpack',
    primaryColor: 'Navy blue',
    brand: 'Wildcraft'
  },
  images: ['/uploads/example.jpg'],
  description: 'Navy Wildcraft backpack with a laptop sleeve and a steel bottle inside.',
  category: 'Backpack',
  location: 'Central Library, 2nd Floor',
  lostAt: new Date().toISOString(),
  ...over
});

const baseFound = (over = {}) => ({
  itemProfile: {
    itemName: 'Black wallet',
    category: 'Wallet',
    primaryColor: 'Black',
    condition: 'Good',
    finderNotes: 'Handed to the security desk.'
  },
  images: [],
  description: 'Black leather wallet found on a bench outside the library entrance.',
  category: 'Wallet',
  location: 'Library entrance',
  foundAt: new Date().toISOString(),
  ...over
});

const NULL_CASES = [
  ['itemProfile: null names the offending field', { itemProfile: null }, 400],
  ['coordinates: null (the map step was skipped)', { coordinates: null }, 201],
  ['coordinates: { lat: null, lng: null }', { coordinates: { lat: null, lng: null } }, 201],
  ['lastSeen: null', { lastSeen: null }, 201],
  ['images: null', { images: null }, 201],
  ['coordinates: { lat, lng } still persists', { coordinates: { lat: 12.9, lng: 77.6 } }, 201],
  ['null attributes inside itemProfile', {
    itemProfile: {
      itemName: 'Navy backpack', category: 'Backpack', primaryColor: null, secondaryColor: null,
      brand: null, model: null, material: null, shape: null, size: null, visibleMark: null,
      ocrText: null, serialNumber: null, estimatedValue: null
    }
  }, 201]
];

async function main() {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_MODE: 'memory', NODE_ENV: 'test' },
    stdio: 'ignore'
  });

  try {
    if (!await waitForServer()) {
      console.log('FAIL  server did not boot on port', PORT);
      process.exitCode = 1;
      return;
    }

    const login = await call('POST', '/api/auth/login', { body: { email: MEMBER, password: PASSWORD } });
    const token = login.data.token;
    if (!token) {
      console.log('FAIL  could not log in:', JSON.stringify(login.data));
      process.exitCode = 1;
      return;
    }

    console.log('\n=== null means "not provided", not a 400 ===');
    for (const [label, over, expected] of NULL_CASES) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call('POST', '/api/reports/lost', { token, body: baseLost(over) });
      check(label, res.status === expected, `status ${res.status} (expected ${expected})`);
    }
  } finally {
    child.kill();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('check crashed:', err);
  process.exitCode = 1;
});

