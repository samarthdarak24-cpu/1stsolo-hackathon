#!/usr/bin/env node
/**
 * One command for every check in this repository.
 *
 * The suites already existed but had to be run one at a time, from a specific
 * directory, in a shell that knew which python to use - so in practice they were
 * run when someone remembered. This runs all of them, from the repo root, with
 * the right interpreter, and prints a summary you can read at a glance.
 *
 *   npm test                     # everything that needs nothing pre-installed
 *   npm test -- --list           # show the suites and exit
 *   npm test -- --only backend   # substring filter on the suite name
 *   npm test -- --with-vector    # also run the vector durability round-trip
 *
 * Rules it follows:
 *   - a suite that cannot run is reported as SKIP with the reason, never as a
 *     pass (a missing Playwright browser is not a passing route test);
 *   - only a failure makes the command exit non-zero;
 *   - the two services used by the live check are only probed if they are
 *     already up - this never starts a server behind your back.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'mern', 'backend');
const AI = path.join(ROOT, 'mern', 'ai-service');
const FRONTEND = path.join(ROOT, 'mern', 'frontend');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const only = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 ? String(argv[i + 1] || '').toLowerCase() : '';
})();

/** The venv python on Windows and posix, falling back to whatever `python` is. */
function pythonBin() {
  const candidates = [
    path.join(AI, '.venv', 'Scripts', 'python.exe'),
    path.join(AI, '.venv', 'bin', 'python')
  ];
  return candidates.find((p) => fs.existsSync(p)) || 'python';
}


/**
 * Live service probe. Deliberately not a child process: it is three HTTP calls,
 * and the interesting part is which of them answers.
 */
function servicesProbe() {
  const targets = [
    { name: 'backend  :5000 /api/health/live', url: 'http://127.0.0.1:5000/api/health/live' },
    { name: 'ai       :8100 /health', url: 'http://127.0.0.1:8100/health' },
    { name: 'frontend :5173 /', url: 'http://127.0.0.1:5173/' }
  ];
  return async () => {
    const lines = [];
    let failed = 0;
    for (const target of targets) {
      try {
        const res = await fetch(target.url, { signal: AbortSignal.timeout(5000) });
        lines.push(`  ${res.ok ? 'ok' : 'HTTP ' + res.status}  ${target.name}`);
        if (!res.ok) failed += 1;
      } catch (err) {
        lines.push(`  down  ${target.name} (${err.name === 'TimeoutError' ? 'timed out' : 'unreachable'})`);
        failed += 1;
      }
    }
    return { code: failed ? 1 : 0, output: lines.join('\n') };
  };
}

const suites = [
  {
    name: 'backend: custody hash-chain',
    cwd: BACKEND,
    cmd: process.execPath,
    argv: ['scripts/custodyChainCheck.js']
  },
  {
    name: 'backend: API end-to-end',
    cwd: BACKEND,
    cmd: process.execPath,
    argv: ['scripts/e2e.js'],
    timeout: 180000
  },
  {
    name: 'backend: SSE contract',
    cwd: BACKEND,
    cmd: process.execPath,
    argv: ['scripts/sseCheck.js'],
    timeout: 120000
  },
  {
    name: 'backend: realtime flow',
    cwd: BACKEND,
    cmd: process.execPath,
    argv: ['scripts/realtimeFlowCheck.js'],
    timeout: 120000
  },
  {
    name: 'ai: pipeline smoke',
    cwd: AI,
    cmd: pythonBin(),
    argv: ['-m', 'tests.smoke'],
    timeout: 600000
  },
  {
    name: 'ai: vector durability',
    cwd: AI,
    // Two interpreters on purpose: the whole point is that the vectors survive
    // the process, so the write and the read must not share one.
    steps: [
      { cmd: pythonBin(), argv: ['-m', 'tests.vector_durability', 'write'] },
      { cmd: pythonBin(), argv: ['-m', 'tests.vector_durability', 'read'] }
    ],
    timeout: 300000,
    skip: () => (flag('--with-vector')
      ? null
      : 'needs the AI service STOPPED (it holds the index lock) - rerun with --with-vector after stopping it')
  },
  {
    name: 'services: live reachability',
    run: servicesProbe()
  },
  {
    name: 'frontend: route smoke',
    cwd: FRONTEND,
    // Plain node + the playwright library, not the @playwright/test runner:
    // `playwright` is already a devDependency here, so this needs no extra
    // package and no config file.
    cmd: process.execPath,
    argv: ['tests/routeSmoke.mjs'],
    timeout: 300000,
    skip: () => {
      if (!fs.existsSync(path.join(FRONTEND, 'node_modules', 'playwright'))) {
        return 'Playwright is not installed (npm --prefix mern/frontend install) - the browser route smoke test cannot run';
      }
      // The dev server has to be up: this test drives the real UI.
      // (Checked optimistically; a failure to connect is reported as a failure.)
      // Browsers live outside node_modules, so a missing binary is its own case.
      // Playwright puts them in ~/.cache/ms-playwright everywhere except
      // Windows, where it uses %LOCALAPPDATA%\ms-playwright - check both so a
      // healthy install is not misreported as a skip.
      const candidates = [
        process.env.PLAYWRIGHT_BROWSERS_PATH,
        path.join(process.env.HOME || process.env.USERPROFILE || '', '.cache', 'ms-playwright'),
        path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
      ].filter(Boolean);
      const found = candidates.some((cache) => fs.existsSync(cache));
      if (!found) return 'browsers not downloaded (npx playwright install chromium)';
      return null;
    }
  }
];

const paint = (code, text) => (process.stdout.isTTY ? `\u001b[${code}m${text}\u001b[0m` : text);
const PASS = paint(32, 'PASS');
const FAIL = paint(31, 'FAIL');
const SKIP = paint(33, 'SKIP');

function tail(text, lines = 6) {
  const kept = String(text || '').trim().split('\n').filter(Boolean).slice(-lines);
  return kept.map((l) => `      ${l}`).join('\n');
}

function runSuite(suite) {
  const steps = suite.steps || [{ cmd: suite.cmd, argv: suite.argv, cwd: suite.cwd }];
  let output = '';
  for (const step of steps) {
    const result = spawnSync(step.cmd, step.argv, {
      cwd: step.cwd || suite.cwd,
      encoding: 'utf8',
      timeout: suite.timeout || 120000,
      env: { ...process.env, FORCE_COLOR: '0' }
    });
    output += (result.stdout || '') + (result.stderr || '');
    if (result.error || result.status !== 0) {
      return { code: result.status === null ? 1 : result.status, output };
    }
    // Some suites print a PASS marker but still exit 0 on a soft failure; the
    // exit code is the contract, so that is what we go by.
  }
  return { code: 0, output };
}

(async () => {
  if (flag('--list')) {
    console.log('Suites:');
    suites.forEach((s, i) => console.log(`  ${i + 1}. ${s.name}`));
    return;
  }

  const selected = suites.filter((s) => !only || s.name.toLowerCase().includes(only));
  if (!selected.length) {
    console.error(`No suite matches --only ${only}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nLostLink AI - ${selected.length} suite(s)\n${'-'.repeat(60)}`);
  const failures = [];

  for (const suite of selected) {
    const reason = suite.skip ? suite.skip() : null;
    if (reason) {
      console.log(`${SKIP}  ${suite.name}\n      ${reason}`);
      continue;
    }
    process.stdout.write(`...   ${suite.name}\r`);
    const started = Date.now();
    // A suite is either a child process (most of them) or an in-process probe
    // (`run`). The probe deliberately is not spawned: it is three HTTP calls and
    // the answer matters, not the exit code of a shell. Both must be awaited,
    // and the probe's result shape matches the child one so the reporting below
    // stays identical.
    const { code, output } = typeof suite.run === 'function'
      ? await suite.run()
      : runSuite(suite);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (code === 0) {
      console.log(`${PASS}  ${suite.name} ${paint(90, `(${seconds}s)`)}`);
    } else {
      console.log(`${FAIL}  ${suite.name} ${paint(90, `(${seconds}s, exit ${code})`)}`);
      if (output.trim()) console.log(tail(output));
      failures.push(suite.name);
    }
  }

  console.log('-'.repeat(60));
  if (failures.length) {
    console.log(`${failures.length} suite(s) failed: ${failures.join(', ')}\n`);
    process.exitCode = 1;
  } else {
    console.log('All runnable suites passed.\n');
  }
})();
