/**
 * Throwaway probe: print what GET /api/reports returns for the seeded member,
 * so a failing assertion can be told apart from a real data problem.
 */
const path = require('path');
const { spawn } = require('child_process');

const PORT = 5098;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, ['src/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATA_MODE: 'memory', PORT: String(PORT), AI_ENABLED: 'false', NODE_ENV: 'test', JWT_SECRET: 'probe' },
    stdio: ['ignore', 'ignore', 'ignore']
  });
  try {
    for (let i = 0; i < 60; i += 1) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* wait */ }
      await sleep(400);
    }
    const login = await (await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@abcschool.com', password: 'lostlink123' })
    })).json();
    const token = login.token;

    for (const qs of ['?limit=200', '?scope=all&limit=200', '?scope=mine&limit=200']) {
      const res = await fetch(`${BASE}/api/reports${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json();
      console.log(qs, '->', res.status, 'rows=', (body.reports || []).length, 'total=', body.total, 'limit=', body.limit);
    }

    const all = await (await fetch(`${BASE}/api/reports?scope=all&limit=200`, {
      headers: { Authorization: `Bearer ${token}` }
    })).json();
    console.log('\nABC School names seen:');
    console.log([...new Set((all.reports || []).map((r) => r.itemProfile?.itemName))].join(' | '));
  } finally {
    server.kill();
  }
  process.exit(0);
})();
