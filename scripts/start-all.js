#!/usr/bin/env node
/**
 * Starts all three services, detached, and says what it started.
 *
 * `start-mern.cmd` already does this on Windows, but it ties the services to the
 * console that launched them: closing that terminal (or a tool call ending)
 * takes the backend down with it, which looks exactly like a crash. This spawns
 * each service in its own detached process group, writes its log next to the
 * service, then waits until each port actually answers before reporting.
 *
 *   npm start
 *   npm start -- --only backend        # one service
 *   npm start -- --no-wait             # return as soon as they are launched
 *
 * Ports come from each service's own start script, so the machine-wide PORT
 * environment variable cannot hijack them.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';

const services = [
  {
    key: 'ai',
    name: 'ai-service  :8100',
    cwd: path.join(ROOT, 'mern', 'ai-service'),
    script: 'start-server.cmd',
    log: 'ai-service.out.log',
    url: 'http://127.0.0.1:8100/health'
  },
  {
    key: 'backend',
    name: 'backend     :5000',
    cwd: path.join(ROOT, 'mern', 'backend'),
    script: 'start-server.cmd',
    log: 'backend.out.log',
    url: 'http://127.0.0.1:5000/api/health/live'
  },
  {
    key: 'frontend',
    name: 'frontend    :5173',
    cwd: path.join(ROOT, 'mern', 'frontend'),
    script: 'start-server.cmd',
    log: 'frontend.out.log',
    url: 'http://127.0.0.1:5173/'
  }
];

const argv = process.argv.slice(2);
const only = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 ? String(argv[i + 1] || '').toLowerCase() : '';
})();
const wait = !argv.includes('--no-wait');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reachable(url, timeoutMs = 3000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

(async () => {
  const selected = services.filter((s) => !only || s.key === only || s.name.includes(only));
  if (!selected.length) {
    console.error(`No service matches --only ${only}. Try: ${services.map((s) => s.key).join(', ')}`);
    process.exit(1);
  }

  for (const service of selected) {
    if (!fs.existsSync(service.cwd)) {
      console.error(`skip ${service.name}: ${service.cwd} does not exist`);
      continue;
    }

    if (await reachable(service.url)) {
      console.log(`already up  ${service.name}`);
      continue;
    }

    // A missing start script is a real error worth naming rather than a
    // mysterious exit code from a shell.
    const scriptPath = path.join(service.cwd, service.script);
    if (!fs.existsSync(scriptPath)) {
      console.error(`skip ${service.name}: ${service.script} not found in ${service.cwd}`);
      continue;
    }

    const child = isWin
      ? spawn('cmd', ['/c', service.script], {
        cwd: service.cwd,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })
      : spawn('sh', [service.script], { cwd: service.cwd, detached: true, stdio: 'ignore' });

    child.unref();
    console.log(`launched    ${service.name}  (log: ${path.join('mern', service.key === 'ai' ? 'ai-service' : service.key, service.log)})`);
  }

  if (!wait) return;

  console.log('\nwaiting for the services to answer...');
  const pending = new Set(selected.map((s) => s.key));
  const deadline = Date.now() + (only === 'ai' ? 180000 : 90000);

  while (pending.size && Date.now() < deadline) {
    for (const service of selected) {
      if (!pending.has(service.key)) continue;
      if (await reachable(service.url)) {
        pending.delete(service.key);
        console.log(`ready       ${service.name}`);
      }
    }
    if (pending.size) await sleep(2000);
  }

  for (const key of pending) {
    const service = services.find((s) => s.key === key);
    console.error(`not ready   ${service.name} - check mern/${key}/${service.log}`);
  }
  process.exitCode = pending.size ? 1 : 0;
})();
