/**
 * Queue journal replay check (T2).
 *
 * The in-process queue journals unfinished jobs so a restart cannot silently
 * drop a match a user is waiting on. The property is: a job that was in flight
 * when the process died is replayed by the NEXT process, and the report it
 * belongs to stops being stuck at MATCHING.
 *
 * Timing that out between a live enqueue and a SIGKILL is racy, so this drives
 * the same mechanism deterministically in two steps, exactly like
 * tests/vector_durability.py does for the vector store:
 *
 *   1. setup   - parks one real report at MATCHING and writes a real
 *                `match:report` job into the journal file, as a crash would.
 *   2. restart the backend (this is the part a script cannot do for you).
 *   3. verify  - reads the journal (it must be drained) and the report (it must
 *                have left MATCHING), and greps the boot log for the restore
 *                line.
 *
 * Usage, from mern/backend:
 *   node scripts/queueReplayCheck.js setup
 *   ... restart the API ...
 *   node scripts/queueReplayCheck.js verify
 */
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { initStore, getDriver } = require('../src/store');

const JOURNAL = config.queue.statePath;
const MARKER = path.join(process.cwd(), '.cache', 'queue-replay-check.json');
const LOG = path.join(process.cwd(), 'backend.out.log');

const readJson = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

const writeJournal = (jobs) => {
  fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
  const tmp = `${JOURNAL}.check-tmp`;
  fs.writeFileSync(tmp, JSON.stringify(jobs));
  fs.renameSync(tmp, JOURNAL);
};

async function setup() {
  await initStore();
  const store = getDriver();
  const orgs = await store.listOrgs();

  let report = null;
  for (const org of orgs) {
    const { reports } = await store.listReports(org.id, { limit: 20 });
    report = reports.find((r) => !['RETURNED', 'CLOSED'].includes(r.status));
    if (report) break;
  }
  if (!report) {
    console.error('No report available to use as a replay subject.');
    process.exit(1);
  }

  // Park it at MATCHING: that is the state a user is left staring at when a
  // queued match job is lost.
  await store.updateReport(report.id, { status: 'MATCHING' });

  const job = {
    id: `${Date.now()}-replaycheck`,
    name: 'match:report',
    data: { reportId: report.id, replayCheck: true },
    attempts: 1
  };
  writeJournal([job]);
  fs.writeFileSync(MARKER, JSON.stringify({ reportId: report.id, reference: report.reference, at: new Date().toISOString() }));

  console.log('setup complete:');
  console.log(`  report   : ${report.reference} (${report.id}) set to MATCHING`);
  console.log(`  journal  : ${JOURNAL} holds 1 unfinished ${job.name} job`);
  console.log('\nNow restart the API, then run:  node scripts/queueReplayCheck.js verify');
}

async function verify() {
  const marker = readJson(MARKER);
  if (!marker) {
    console.error('No setup marker found - run "setup" first.');
    process.exit(1);
  }

  await initStore();
  const store = getDriver();
  const report = await store.findReportById(marker.reportId);
  if (!report) {
    console.error(`Report ${marker.reportId} no longer exists.`);
    process.exit(1);
  }

  const journal = readJson(JOURNAL, []);
  const restoredLine = fs.existsSync(LOG)
    ? (fs.readFileSync(LOG, 'utf8').split('\n').reverse().find((l) => l.includes('restored')) || '')
    : '';

  const drained = !journal.some((j) => j && j.data && j.data.reportId === marker.reportId);
  const leftMatching = report.status !== 'MATCHING';
  const sawRestoreLine = restoredLine.includes('unfinished job(s)');

  const state = [
    { name: 'the journal no longer holds the job', ok: drained },
    { name: `the report left MATCHING (now ${report.status})`, ok: leftMatching },
    { name: 'the boot log shows the restore line', ok: sawRestoreLine, detail: restoredLine.trim() }
  ];

  let failed = 0;
  for (const { name, ok, detail } of state) {
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `\n          ${detail}` : ''}`);
  }

  if (!failed) {
    console.log('\nPASS: a job journalled before the crash was replayed, and its report is no longer stuck.');
    fs.unlinkSync(MARKER);
  } else {
    console.log('\nFAIL: the journal was not replayed as expected.');
  }
  process.exit(failed ? 1 : 0);
}

const command = process.argv[2];
const run = command === 'setup' ? setup : command === 'verify' ? verify : null;
if (!run) {
  console.log('Usage: node scripts/queueReplayCheck.js setup|verify');
  process.exit(2);
}
run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('check failed:', err.message);
    process.exit(1);
  });
