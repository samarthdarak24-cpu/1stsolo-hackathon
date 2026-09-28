/**
 * End-to-end acceptance test for the LostLink AI API.
 *
 * Boots the REAL Express server as a child process (DATA_MODE=memory, so the run
 * is hermetic and needs no Mongo or Redis) and then exercises the HTTP contract
 * exactly the way the React client does. It exists to catch the failures that a
 * unit test cannot see:
 *
 *   - the in-memory driver returning a DIFFERENT response envelope than MongoDB
 *     (`reports` / `matches` / `notifications` / `logs` instead of `rows`), which
 *     silently leaves every list screen empty
 *   - chain-of-custody rows that append, validate and stay tenant-scoped
 *   - the CCTV path refusing to invent a last-seen timeline when the model
 *     service is disabled
 *   - role gates and cross-organization reads enforced on the server, not in the UI
 *
 * Run from mern/backend:   node scripts/e2e.js
 * Exit code 0 only when every check passed.
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = Number(process.env.E2E_PORT || 5062);
const BASE = `http://127.0.0.1:${PORT}`;
const BOOT_TIMEOUT_MS = 40000;
const PASSWORD = 'lostlink123';

const ADMIN_ABC = 'admin@abcschool.com';
const MEMBER_ABC = 'student@abcschool.com';
const MEMBER_XYZ = 'employee@xyzcompany.com';
const ADMIN_XYZ = 'admin@xyzcompany.com';
const ADMIN_TECH = 'admin@techcorp.com';
const MEMBER_TECH = 'student@techcorp.com';
const ADMIN_HOSPITAL = 'admin@cityhospital.org';
const MEMBER_HOSPITAL = 'student@cityhospital.org';
const ADMIN_HACK = 'admin@hackathon.dev';
const MEMBER_HACK = 'student@hackathon.dev';

// Every seeded organization, so the acceptance matrix can assert that the demo
// data is actually there rather than assuming it.
const SEEDED_ORGS = [
  { name: 'ABC School', admin: ADMIN_ABC, member: MEMBER_ABC },
  { name: 'XYZ Company', admin: ADMIN_XYZ, member: MEMBER_XYZ },
  { name: 'TechCorp', admin: ADMIN_TECH, member: MEMBER_TECH },
  { name: 'City Hospital', admin: ADMIN_HOSPITAL, member: MEMBER_HOSPITAL },
  { name: 'Hackathon 2026', admin: ADMIN_HACK, member: MEMBER_HACK }
];

let passed = 0;
let failures = [];

function section(title) {
  // eslint-disable-next-line no-console
  console.log(`\n=== ${title} ===`);
}

function check(label, ok, detail = '') {
  const suffix = detail === '' || detail === undefined ? '' : ` - ${detail}`;
  // eslint-disable-next-line no-console
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${suffix}`);
  if (ok) passed += 1;
  else failures.push(label);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

const get = (pathname, token) => call('GET', pathname, { token });
const post = (pathname, token, body) => call('POST', pathname, { token, body });

async function waitForServer() {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
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
      JWT_SECRET: 'e2e-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const log = [];
  child.stdout.on('data', d => log.push(String(d).trim()));
  child.stderr.on('data', d => log.push(String(d).trim()));
  return { child, log };
}

async function login(email) {
  const res = await post('/api/auth/login', null, { email, password: PASSWORD });
  return { status: res.status, token: res.data?.token || null, data: res.data };
}

async function main() {
  const { child, log } = startServer();
  const stop = () => { try { child.kill(); } catch { /* already gone */ } };

  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(130); });

  try {
    const up = await waitForServer();
    section('0. server boot');
    check('the API boots and answers /api/health', up, up ? BASE : log.slice(-6).join(' | '));
    if (!up) throw new Error('server did not start');

    /* ------------------------------------------------------------------ */
    section('1. authentication');
    const health = await get('/api/health');
    // This harness runs with AI_ENABLED=false, so the honest status here is
    // "degraded" - asserting "ok" would force the endpoint to lie about a
    // deliberately disabled dependency. The real invariant is that a degraded
    // status must always carry the reason, so an operator is never left guessing.
    const healthReason = health.data?.degradedReason || '';
    check(
      'GET /api/health reports a truthful status with a reason when degraded',
      health.status === 200
        && ['ok', 'degraded'].includes(health.data?.status)
        && (health.data?.status === 'ok' || healthReason.length > 0),
      `${health.status} ${health.data?.status}${healthReason ? ` - ${healthReason}` : ''}`
    );

    const badLogin = await post('/api/auth/login', null, { email: ADMIN_ABC, password: 'wrong-password' });
    check('a wrong password is rejected', badLogin.status === 401, `${badLogin.status}`);

    const admin = await login(ADMIN_ABC);
    check('the organization owner can sign in', admin.status === 200 && Boolean(admin.token), `${admin.status}`);
    if (!admin.token) throw new Error('cannot continue without a token');

    const me = await get('/api/auth/me', admin.token);
    check('GET /api/auth/me returns the session identity', me.status === 200 && me.data?.user?.email === ADMIN_ABC,
      me.data?.user?.email || `${me.status}`);

    /* ------------------------------------------------------------------ */
    // The memory driver must return the SAME envelopes as MongoDB. A mismatch
    // here is invisible in the API and empties every list screen in the UI.
    section('2. store envelopes (memory driver parity)');
    const reportsRes = await get('/api/reports?scope=all&limit=10', admin.token);
    const reports = reportsRes.data?.reports;
    check('GET /api/reports returns a `reports` array', Array.isArray(reports), `${reportsRes.status}`);
    check('the seeded organization has reports', Array.isArray(reports) && reports.length > 0,
      Array.isArray(reports) ? `${reports.length} rows` : 'undefined');

    const matchesRes = await get('/api/matches?limit=10', admin.token);
    check('GET /api/matches returns a `matches` array', Array.isArray(matchesRes.data?.matches), `${matchesRes.status}`);

    const notifRes = await get('/api/notifications', admin.token);
    check('GET /api/notifications returns a `notifications` array',
      Array.isArray(notifRes.data?.notifications), `${notifRes.status}`);

    const auditRes = await get('/api/audit-logs', admin.token);
    check('GET /api/audit-logs returns a `logs` array', Array.isArray(auditRes.data?.logs), `${auditRes.status}`);

    const returnsRes = await get('/api/returns', admin.token);
    check('GET /api/returns returns a `returns` array', Array.isArray(returnsRes.data?.returns), `${returnsRes.status}`);

    const reportId = reports?.[0]?.id;
    check('a report id is available for the custody checks', Boolean(reportId), reportId);

    /* ------------------------------------------------------------------ */
    section('3. chain of custody');
    const trail0 = await get(`/api/reports/${reportId}/custody`, admin.token);
    check('GET /api/reports/:id/custody is available', trail0.status === 200 && Array.isArray(trail0.data?.custody),
      `${trail0.status}`);
    const before = trail0.data?.custody?.length || 0;

    const noteEntry = await post(`/api/reports/${reportId}/custody`, admin.token,
      { event: 'NOTE', note: 'e2e: inspected at the desk' });
    check('a NOTE entry is appended', noteEntry.status === 201 && Boolean(noteEntry.data?.record?.id),
      `${noteEntry.status}`);
    check('the entry is written against the caller organization',
      noteEntry.data?.record?.organizationId === admin.data?.user?.activeOrgId,
      noteEntry.data?.record?.organizationId || 'missing');
    check('the entry records the acting staff member', Boolean(noteEntry.data?.record?.actorName),
      noteEntry.data?.record?.actorName || 'missing');

    const badHandoff = await post(`/api/reports/${reportId}/custody`, admin.token, { event: 'STORED' });
    check('a hand-off without a holder is rejected', badHandoff.status === 400, `${badHandoff.status}`);
    check('the rejection explains what is missing', /toCustodian/i.test(badHandoff.data?.message || ''),
      badHandoff.data?.message || '');

    const handoff = await post(`/api/reports/${reportId}/custody`, admin.token,
      { event: 'HANDED_TO_STAFF', toCustodian: 'Front desk (e2e)' });
    check('a hand-off entry is appended', handoff.status === 201, `${handoff.status}`);

    const trail1 = await get(`/api/reports/${reportId}/custody`, admin.token);
    const custody = trail1.data?.custody || [];
    check('the trail grew by exactly two rows', custody.length === before + 2, `${before} -> ${custody.length}`);
    check('the trail is oldest-first', custody.every((row, i) => i === 0
      || new Date(custody[i - 1].occurredAt) <= new Date(row.occurredAt)));
    check('the current holder is the one named in the last hand-off',
      trail1.data?.currentHolder === 'Front desk (e2e)', trail1.data?.currentHolder || 'missing');

    const oneRecord = await get(`/api/custody/${handoff.data?.record?.id}`, admin.token);
    check('GET /api/custody/:id returns the record', oneRecord.status === 200
      && oneRecord.data?.record?.id === handoff.data?.record?.id, `${oneRecord.status}`);

    const filtered = await get(`/api/custody?reportId=${reportId}`, admin.token);
    check('GET /api/custody?reportId= filters to one item',
      Array.isArray(filtered.data?.records) && filtered.data.records.every(r => r.reportId === reportId),
      `${filtered.data?.records?.length ?? 'undefined'} rows`);
    check('every custody row carries its report header',
      Array.isArray(filtered.data?.records)
      && filtered.data.records.every(r => r.report && typeof r.report.reference === 'string'));

    /* ------------------------------------------------------------------ */
    // The ledger must exist without anyone remembering to open it, and the UI
    // must be able to write every event the backend accepts.
    section('3b. intake opens the chain, and the UI event list is real');
    const memberToken = (await login(MEMBER_ABC)).token;
    const intake = await post('/api/reports/found', memberToken, {
      itemProfile: {
        itemName: 'Wireless headphones',
        category: 'Electronics',
        primaryColor: 'Black',
        visibleMark: 'A small scratch on the left earcup'
      },
      category: 'Electronics',
      description: 'Black wireless headphones left on a study desk, e2e intake check.',
      location: 'Library, floor 2',
      foundAt: new Date(Date.now() - 3600_000).toISOString()
    });
    check('a member can hand in a found item', intake.status === 201, `${intake.status}`);

    const intakeId = intake.data?.report?.id;
    const intakeTrail = await get(`/api/reports/${intakeId}/custody`, admin.token);
    const first = intakeTrail.data?.custody?.[0];
    check('receiving an item opens the chain of custody immediately',
      first?.event === 'LOGGED', first?.event || 'no chain');
    check('the opening entry names who holds the item', Boolean(first?.toCustodian),
      first?.toCustodian || 'missing');
    check('the opening entry is signed by the person who handed it in',
      Boolean(first?.actorName), first?.actorName || 'missing');

    // Exactly the events the custody form offers, straight from the dropdown.
    const UI_EVENTS = ['LOGGED', 'STORED', 'MOVED', 'HANDED_TO_STAFF', 'HANDED_OVER', 'RELEASED', 'DISPOSED', 'NOTE'];
    const HANDOFF = ['LOGGED', 'STORED', 'HANDED_TO_STAFF', 'HANDED_OVER', 'RELEASED'];
    const accepted = [];
    const refused = [];
    for (const event of UI_EVENTS) {
      const res = await post(`/api/reports/${intakeId}/custody`, admin.token, {
        event,
        toCustodian: HANDOFF.includes(event) ? 'e2e holder' : '',
        location: 'Room 101',
        note: `e2e ${event}`
      });
      (res.status === 201 ? accepted : refused).push(event);
    }
    check('every event offered by the custody form is accepted by the API',
      refused.length === 0, refused.length ? `refused: ${refused.join(', ')}` : `${accepted.length} events`);

    const invented = await post(`/api/reports/${intakeId}/custody`, admin.token,
      { event: 'REGISTERED', toCustodian: 'x' });
    check('an event outside the agreed vocabulary is refused', invented.status === 400, `${invented.status}`);

    /* ------------------------------------------------------------------ */
    section('3c. CCTV evidence is read back honestly');
    const evidence = await get(`/api/cctv/events/${intakeId}`, admin.token);
    check('GET /api/cctv/events/:reportId answers', evidence.status === 200, `${evidence.status}`);
    check('an item nobody searched has no evidence at all',
      evidence.data?.total === 0 && Array.isArray(evidence.data?.events)
      && evidence.data.events.length === 0, `${evidence.data?.total ?? 'undefined'} rows`);
    check('the empty case says why it is empty',
      /no clip has been searched/i.test(evidence.data?.notice || ''), evidence.data?.notice || '');
    check('the methodology disclaimer travels with the data',
      /no face recognition/i.test(evidence.data?.methodology || ''), 'missing');
    check('a plain member cannot read clip evidence',
      (await get(`/api/cctv/events/${intakeId}`, memberToken)).status === 403, 'checked');

    const moved = await post(`/api/reports/${intakeId}/custody`, admin.token,
      { event: 'MOVED', location: 'Room 102', note: 'the form default payload' });
    check('the form default (MOVED, no holder) is a valid entry', moved.status === 201, `${moved.status}`);
    check('a later entry continues the chain from the previous holder',
      moved.data?.record?.fromCustodian === 'e2e holder', moved.data?.record?.fromCustodian || 'missing');

    // A NOTE names no holder, so it must not blank out the holder the chain last
    // established - that continuity is the whole point of the record.
    const holderTrail = await get(`/api/reports/${intakeId}/custody`, admin.token);
    check('a note without a holder does not erase the established holder',
      holderTrail.data?.currentHolder === 'e2e holder', holderTrail.data?.currentHolder || 'missing');

    /* ------------------------------------------------------------------ */
    // With AI_ENABLED=false there is no model service, and the CCTV path must
    // say so instead of producing a plausible-looking timeline.
    section('4. CCTV honesty');
    const cctvStatus = await get('/api/cctv/status', admin.token);
    check('GET /api/cctv/status answers', cctvStatus.status === 200, `${cctvStatus.status}`);
    check('the status states whether AI is enabled', typeof cctvStatus.data?.aiEnabled === 'boolean',
      String(cctvStatus.data?.aiEnabled));
    check('the status explains itself in plain language',
      typeof cctvStatus.data?.notice === 'string' && cctvStatus.data.notice.length > 20,
      cctvStatus.data?.notice || 'missing');

    const clip = await post('/api/cctv/analyze', admin.token,
      { reportId, videoPath: '/tmp/does-not-exist-e2e.mp4' });
    check('clip analysis refuses to run without the model service', clip.status === 503, `${clip.status}`);
    // The reason must reach the screen: a deliberate 503 may never be replaced by
    // the generic "something went wrong" text.
    check('the refusal explains itself instead of hiding behind a generic 500 message',
      /ai|model|analysis service/i.test(clip.data?.message || ''), clip.data?.message || '');

    /* ------------------------------------------------------------------ */
    section('5. tenant isolation and role gates');
    // The outsider must be an ADMIN of the other organization: a plain member is
    // stopped one layer earlier by the permission check, which would hide a
    // genuine cross-tenant leak behind a 403.
    const outsider = await login(ADMIN_XYZ);
    check('an admin of another organization can sign in', outsider.status === 200 && Boolean(outsider.token),
      `${outsider.status}`);

    const foreignCustody = await get(`/api/custody/${handoff.data?.record?.id}`, outsider.token);
    check('another organization cannot read this custody record',
      foreignCustody.status === 404, `${foreignCustody.status}`);

    const foreignTrail = await get(`/api/reports/${reportId}/custody`, outsider.token);
    check('another organization cannot read this custody trail', foreignTrail.status === 404, `${foreignTrail.status}`);

    const foreignList = await get(`/api/custody?reportId=${reportId}`, outsider.token);
    check('the org-wide custody list never leaks another tenant row',
      Array.isArray(foreignList.data?.records) && foreignList.data.records.length === 0,
      `${foreignList.data?.records?.length ?? 'undefined'} rows`);

    const foreignReport = await get(`/api/reports/${reportId}`, outsider.token);
    check('another organization cannot read this report', foreignReport.status === 404, `${foreignReport.status}`);

    if (intakeId) {
      const foreignEvidence = await get(`/api/cctv/events/${intakeId}`, outsider.token);
      check('another organization cannot read this item\'s clip evidence',
        foreignEvidence.status === 404, `${foreignEvidence.status}`);
    }

    // Cross-tenant reads are 404 by design — another organization's report is
    // reported as missing rather than confirmed to exist — so an XYZ member
    // asking about an ABC report never reaches the permission layer at all. That
    // layer is what a SAME-organization member without custody rights gets, so
    // both are asserted here instead of one standing in for the other.
    const outsiderMember = await login(MEMBER_XYZ);
    const memberTrail = await get(`/api/reports/${reportId}/custody`, outsiderMember.token);
    check('a member of another organization cannot read this item\'s custody trail',
      memberTrail.status === 404, `${memberTrail.status}`);

    const member = await login(MEMBER_ABC);
    const abcReports = (await get('/api/reports?scope=all&limit=100', admin.token)).data?.reports || [];
    const notTheirs = abcReports.find(r => r.userId !== member.data?.user?.id);
    check('a same-organization member has a report that is not theirs to test against',
      Boolean(notTheirs), notTheirs?.reference || 'none');
    const sameOrgTrail = await get(`/api/reports/${notTheirs?.id}/custody`, member.token);
    check('a plain member is refused one layer earlier, by permission',
      sameOrgTrail.status === 403, `${sameOrgTrail.status} ${sameOrgTrail.data?.message || ''}`);

    const memberWrite = await post(`/api/reports/${reportId}/custody`, member.token,
      { event: 'NOTE', note: 'e2e: should be refused' });
    check('a plain member cannot write custody entries', memberWrite.status === 403, `${memberWrite.status}`);

    const memberClip = await post('/api/cctv/analyze', member.token, { reportId, videoPath: '/tmp/x.mp4' });
    check('a plain member cannot request clip analysis', memberClip.status === 403, `${memberClip.status}`);

    /* ------------------------------------------------------------------ */
    // The demo data is the first thing a judge touches, so every seeded
    // organization is exercised end to end: both demo logins work, each admin
    // lands in their own dashboard with their own data, and no two tenants can
    // see each other.
    section('6. seeded organizations (acceptance matrix)');
    const orgs = [];
    for (const spec of SEEDED_ORGS) {
      // eslint-disable-next-line no-await-in-loop
      const adminSession = await login(spec.admin);
      // eslint-disable-next-line no-await-in-loop
      const memberSession = await login(spec.member);
      const orgName = adminSession.data?.user?.organizations?.[0]?.name
        || adminSession.data?.organizations?.[0]?.name
        || null;
      orgs.push({ ...spec, admin: adminSession, member: memberSession, orgName, orgId: adminSession.data?.user?.activeOrgId });

      check(`${spec.name}: the admin demo account can sign in`,
        adminSession.status === 200 && Boolean(adminSession.token), `${adminSession.status}`);
      check(`${spec.name}: the member demo account can sign in`,
        memberSession.status === 200 && Boolean(memberSession.token), `${memberSession.status}`);
      check(`${spec.name}: the admin lands in the seeded organization`,
        orgName === spec.name, orgName || 'no organization in session');
    }

    // A full cycle on a real challenge. It creates its own lost+found pair rather
    // than reusing seeded state, because earlier sections in this same run may
    // already have consumed the one verification a match allows.
    section('7. ownership verification is answerable and never leaks');
    for (const org of orgs) {
      if (!org.admin.token) continue;
      // eslint-disable-next-line no-await-in-loop
      const list = await get('/api/verifications?limit=50', org.admin.token);
      const rows = list.data?.verifications || [];
      check(`${org.orgName}: the verification list answers with a usable shape`,
        Array.isArray(rows), `${rows.length} rows`);
      if (!rows.length) continue;
      check(`${org.orgName}: every verification carries a non-empty question`,
        rows.every((v) => typeof v.question === 'string' && v.question.length > 10),
        rows.every((v) => v.question) ? 'all present' : 'one or more empty');
      check(`${org.orgName}: the expected answer is never sent to a reviewer`,
        rows.every((v) => !v.challenge && !v.expectedEvidence), 'checked');
    }

    const ownerToken = (await login(MEMBER_ABC)).token;
    const when = new Date(Date.now() - 3600_000).toISOString();
    const lostForCheck = await post('/api/reports/lost', ownerToken, {
      itemProfile: {
        itemName: 'Verification Test Wallet',
        category: 'Personal',
        primaryColor: 'Tan',
        visibleMark: 'Engraved initials JK on the corner'
      },
      category: 'Personal',
      description: 'Lost a tan wallet with the initials JK engraved on the corner, in the library foyer.',
      location: 'Library Foyer',
      lostAt: when
    });
    check('a fresh lost report can be filed for the verification check',
      lostForCheck.status === 201, `${lostForCheck.status}`);

    const foundForCheck = await post('/api/reports/found', ownerToken, {
      itemProfile: {
        itemName: 'Verification Test Wallet',
        category: 'Personal',
        primaryColor: 'Tan',
        visibleMark: 'Engraved initials JK on the corner'
      },
      category: 'Personal',
      description: 'Found a tan wallet with the initials JK engraved on the corner, on a foyer bench.',
      location: 'Library Foyer',
      foundAt: new Date(Date.now() - 1800_000).toISOString()
    });
    check('a matching found report pairs with it', foundForCheck.status === 201, `${foundForCheck.status}`);

    // Matching is ENQUEUED by the create call rather than awaited by it (see
    // aiWorker/matchingService: setImmediate), so a pair filed milliseconds ago
    // has not necessarily been scored yet. Poll instead of demanding the
    // candidate in the same tick — an immediate read is a race, not a contract.
    let fresh = null;
    for (let attempt = 0; attempt < 12 && !fresh; attempt += 1) {
      if (attempt) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(500);
      }
      // eslint-disable-next-line no-await-in-loop
      const freshMatches = await get('/api/matches?limit=50', ownerToken);
      fresh = (freshMatches.data?.matches || [])
        .find((m) => m.lost?.id === lostForCheck.data?.report?.id
          && ['PENDING_VERIFICATION', 'MANUAL_REVIEW', 'PENDING'].includes(m.status));
    }

    if (fresh) {
      const started = await post('/api/verifications', ownerToken, { matchId: fresh.id });
      check('the owner can start an ownership verification', started.status === 201, `${started.status}`);
      const ver = started.data?.verification;
      check('the started challenge returns a real question',
        typeof ver?.question === 'string' && ver.question.length > 10, ver?.question || 'empty');
      check('the started challenge withholds the expected answer',
        !ver?.challenge && !ver?.expectedEvidence, 'checked');

      const wrong = await post(`/api/verifications/${ver.id}/answer`, ownerToken, { answer: 'zzz qqq xxx' });
      check('a wrong answer is graded and stays retryable',
        wrong.status === 200 && wrong.data?.verification?.status === 'PENDING',
        `${wrong.status} ${wrong.data?.verification?.status}`);

      // The challenge type is chosen at random from four builders, so the answer
      // has to match whichever question was actually asked. The test filed the
      // report itself, so it knows every fact that could have been asked about.
      // Keys are the stable question stems from verificationService.
      const ANSWERS = [
        ['mark, logo or sticker', 'engraved initials JK on the corner'],
        ['inside the item', 'verification test wallet'],
        ['last seen', 'Library Foyer'],
        ['brand was printed', 'verification test wallet']
      ];
      const asked = (ver.question || '').toLowerCase();
      const picked = ANSWERS.find(([stem]) => asked.includes(stem));
      check('the question maps to a known answer for this test report', Boolean(picked), ver.question);

      if (picked) {
        const right = await post(`/api/verifications/${ver.id}/answer`, ownerToken, { answer: picked[1] });
        check('the correct answer verifies the case',
          right.status === 200 && right.data?.verification?.status === 'VERIFIED',
          `${right.status} ${right.data?.verification?.status} (score ${right.data?.verification?.verificationScore})`);
      }
    } else {
      check('the new pair produced a matchable candidate', false, 'no match created');
    }

    section('8. each organization sees only its own data');
    for (const org of orgs) {
      if (!org.admin.token) continue;
      // eslint-disable-next-line no-await-in-loop
      const reports = await get('/api/reports?scope=all&limit=100', org.admin.token);
      const rows = reports.data?.reports || [];
      const mine = rows.filter((r) => r.organizationId === org.orgId).length;
      check(`${org.orgName}: every listed report belongs to that organization`,
        rows.length > 0 && mine === rows.length, `${mine}/${rows.length} rows`);
      check(`${org.orgName}: the organization has its own reports to show`,
        rows.length > 0, `${rows.length} rows`);

      // eslint-disable-next-line no-await-in-loop
      const custody = await get('/api/custody?limit=200', org.admin.token);
      const chain = custody.data?.records || [];
      check(`${org.orgName}: the custody ledger never crosses a tenant boundary`,
        chain.every((r) => r.organizationId === org.orgId), `${chain.length} rows`);

      // eslint-disable-next-line no-await-in-loop
      const logs = await get('/api/audit-logs?limit=200', org.admin.token);
      const auditRows = logs.data?.logs || [];
      check(`${org.orgName}: the audit log is scoped to that organization`,
        auditRows.length > 0 && auditRows.every((r) => r.organizationId === org.orgId),
        `${auditRows.length} rows`);
    }

    section('9. cross-organization reads are refused');
    // This compares two organizations that are both seeded and both have an
    // admin, so it proves isolation between real tenants rather than a mere
    // role difference (a plain member is stopped one layer earlier, by RBAC).
    for (let i = 0; i < orgs.length; i += 1) {
      const source = orgs[i];
      if (!source.admin.token) continue;
      for (let j = 0; j < orgs.length; j += 1) {
        if (i === j || !orgs[j].admin.token) continue;
        // The victim report has to be discovered with the OWNING org's token.
        // Asking the source org to list it would return nothing — isolation is
        // precisely what is under test, so it would silently skip every pair.
        // eslint-disable-next-line no-await-in-loop
        const owned = await get('/api/reports?scope=all&limit=100', orgs[j].admin.token);
        const victim = (owned.data?.reports || []).find((r) => r.organizationId === orgs[j].orgId);
        if (!victim) {
          check(`${source.orgName} vs ${orgs[j].orgName}: a victim report exists to test against`, false, 'none found');
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const cross = await get(`/api/reports/${victim.id}`, source.admin.token);
        check(`${source.orgName} cannot read a ${orgs[j].orgName} report`,
          cross.status === 404 || cross.status === 403, `${cross.status}`);
        // eslint-disable-next-line no-await-in-loop
        const crossTrail = await get(`/api/reports/${victim.id}/custody`, source.admin.token);
        check(`${source.orgName} cannot read a ${orgs[j].orgName} custody trail`,
          crossTrail.status === 404 || crossTrail.status === 403, `${crossTrail.status}`);
        // eslint-disable-next-line no-await-in-loop
        const crossEvidence = await get(`/api/cctv/events/${victim.id}`, source.admin.token);
        check(`${source.orgName} cannot read a ${orgs[j].orgName} clip evidence set`,
          crossEvidence.status === 404 || crossEvidence.status === 403, `${crossEvidence.status}`);
      }
    }

    section('10. member-level permissions hold in every organization');
    for (const org of orgs) {
      if (!org.member.token) continue;
      const memberOrgId = org.member.data?.user?.activeOrgId;
      const memberId = org.member.data?.user?.id;
      // eslint-disable-next-line no-await-in-loop
      const memberReports = await get('/api/reports?scope=all&limit=100', org.member.token);
      const rows = memberReports.data?.reports || [];
      check(`${org.orgName}: a plain member only sees their own reports`,
        rows.every((r) => r.organizationId === memberOrgId && r.userId === memberId),
        `${rows.length} rows`);
      // Custody entries are written against a report, so the refusal has to be
      // proven on the real write path rather than a made-up collection URL.
      // eslint-disable-next-line no-await-in-loop
      const memberWrite = await post(`/api/reports/${rows[0]?.id || 'none'}/custody`, org.member.token,
        { event: 'NOTE', note: 'should be refused' });
      check(`${org.orgName}: a plain member cannot write to the custody ledger`,
        memberWrite.status === 403, `${memberWrite.status}`);
      // eslint-disable-next-line no-await-in-loop
      const memberAnalytics = await get('/api/analytics/organization', org.member.token);
      check(`${org.orgName}: organization analytics stay closed to a plain member`,
        memberAnalytics.status === 403, `${memberAnalytics.status}`);
      // eslint-disable-next-line no-await-in-loop
      const memberUsers = await get(`/api/organizations/${memberOrgId}/users`, org.member.token);
      check(`${org.orgName}: the member roster stays closed to a plain member`,
        memberUsers.status === 403, `${memberUsers.status}`);
    }

    /* ------------------------------------------------------------------ */
    // When a user adds a photo of their own item it becomes the cover that the
    // lists, the match cards and the staff handover screen all render, so the
    // whole path is asserted here: bytes stored and served, image prepended,
    // permission enforced, six-photo cap held, detach reversible — and no
    // orphan file left behind when the upload is refused.
    section('11. report photo (a user-supplied image of their own item)');
    const uploadsDir = path.resolve(__dirname, '..', 'uploads');
    const storedFiles = () => fs.readdirSync(uploadsDir)
      .filter(name => fs.statSync(path.join(uploadsDir, name)).isFile()).length;

    // A 1x1 PNG: real magic bytes, so it passes the same sniffing check a phone
    // photo passes.
    const PNG_BYTES = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489'
      + '0000000a49444154789c6360000002000100ffff03000006000557bfabd4'
      + '0000000049454e44ae426082',
      'hex'
    );

    const uploadPhoto = async (reportIdForUpload, token, { type = 'image/png', ...rest } = {}) => {
      const form = new FormData();
      form.append('image', new Blob([rest.bytes || PNG_BYTES], { type }), 'e2e-item.png');
      const res = await fetch(`${BASE}/api/reports/${reportIdForUpload}/image`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    };

    const myReports = (await get('/api/reports?scope=mine&limit=100', memberToken)).data?.reports || [];
    const photoReport = myReports.find(r => (r.images || []).filter(Boolean).length > 0);
    check('the member has a report with a photo to extend', Boolean(photoReport), photoReport?.reference || 'none');
    const seededCover = photoReport?.images?.[0];
    const photosBefore = (photoReport?.images || []).filter(Boolean).length;

    const added = await uploadPhoto(photoReport.id, memberToken);
    check('a member can add a photo to their own report',
      added.status === 200 && Boolean(added.data?.imageUrl), `${added.status} ${added.data?.message || ''}`);
    check('the new photo becomes the cover the rest of the app renders',
      added.data?.images?.[0] === added.data?.imageUrl, added.data?.images?.[0] || 'missing');
    check('the existing photo is kept rather than replaced',
      (added.data?.images || []).length === photosBefore + 1,
      `${photosBefore} -> ${(added.data?.images || []).length}`);

    const served = await fetch(`${BASE}${added.data?.imageUrl}`);
    check('the stored photo is served back from /uploads',
      served.status === 200 && (served.headers.get('content-type') || '').includes('image/png'),
      `${served.status} ${served.headers.get('content-type') || ''}`);

    const reread = await get(`/api/reports/${photoReport.id}`, memberToken);
    check('GET /api/reports/:id reports the new cover',
      reread.data?.report?.images?.[0] === added.data?.imageUrl, reread.data?.report?.images?.[0] || 'missing');

    const photoAudit = await get('/api/audit-logs?action=REPORT_IMAGE_ADDED&limit=20', admin.token);
    check('the upload is written to the audit log',
      (photoAudit.data?.logs || []).some(row => row.entityId === photoReport.id),
      `${photoAudit.data?.logs?.length ?? 'undefined'} rows`);

    const notAnImage = await uploadPhoto(photoReport.id, memberToken,
      { type: 'text/plain', bytes: Buffer.from('this is not a photo at all') });
    check('a file that is not an image is refused', notAnImage.status === 400, `${notAnImage.status}`);

    const someoneElses = (await get('/api/reports?scope=all&limit=100', admin.token)).data?.reports
      ?.find(r => r.userId !== photoReport.userId);
    check('another member\'s report exists to test the refusal against', Boolean(someoneElses),
      someoneElses?.reference || 'none');
    const filesBeforeRefusal = storedFiles();
    const refusedPhotoUpload = await uploadPhoto(someoneElses?.id, memberToken);
    check('a member cannot attach a photo to someone else\'s report',
      refusedPhotoUpload.status === 403, `${refusedPhotoUpload.status}`);
    check('a refused upload leaves no file behind', storedFiles() === filesBeforeRefusal,
      `${filesBeforeRefusal} -> ${storedFiles()}`);

    const detached = await call('DELETE', `/api/reports/${photoReport.id}/image`,
      { token: memberToken, body: { url: added.data?.imageUrl } });
    check('the caller can detach the photo again', detached.status === 200
      && !(detached.data?.images || []).includes(added.data?.imageUrl), `${detached.status}`);
    check('detaching restores the previous cover', detached.data?.images?.[0] === seededCover,
      detached.data?.images?.[0] || 'missing');

    const bogusDetach = await call('DELETE', `/api/reports/${photoReport.id}/image`,
      { token: memberToken, body: { url: '/uploads/not-this-report.png' } });
    check('a photo that is not on the report cannot be detached', bogusDetach.status === 400, `${bogusDetach.status}`);

    // The report schema caps images at six; the server has to hold that itself
    // rather than trusting a client to stop.
    let lastUpload = null;
    for (let i = 0; i < 7; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      lastUpload = await uploadPhoto(photoReport.id, memberToken);
    }
    check('a report never holds more than six photos', (lastUpload?.data?.images || []).length === 6,
      `${(lastUpload?.data?.images || []).length} photos`);

    /* ---- visual discovery -------------------------------------------- */
    // This endpoint had NO coverage, which is how a schema cap of 20 went
    // unnoticed while the Search page requested 40 and showed every member an
    // error state instead of results.
    const discovery = await get('/api/search?q=a&limit=40', memberToken);
    check('GET /api/search accepts the limit the discovery grid sends',
      discovery.status === 200, `${discovery.status}`);
    check('search returns both sides of the lost & found board',
      Array.isArray(discovery.data?.lostReports) && Array.isArray(discovery.data?.foundReports),
      `${discovery.data?.lostReports?.length ?? 'undefined'} lost / ${discovery.data?.foundReports?.length ?? 'undefined'} found`);

    // A shape check alone would pass on an endpoint that always returned empty
    // arrays, so search for a report that is already known to exist.
    const anyReport = (await get('/api/reports?scope=all&limit=5', admin.token)).data?.reports?.[0];
    const term = (anyReport?.itemProfile?.itemName || anyReport?.category || '').split(' ')[0].slice(0, 16);
    const foundSomething = await get(`/api/search?q=${encodeURIComponent(term)}&limit=40`, admin.token);
    const rowsFound = (foundSomething.data?.lostReports || []).length
      + (foundSomething.data?.foundReports || []).length;
    check('search actually returns a report that exists', rowsFound > 0, `q="${term}" -> ${rowsFound} rows`);

    const unbounded = await get('/api/search?q=a&limit=500', memberToken);
    check('search still refuses an unbounded limit', unbounded.status === 400, `${unbounded.status}`);

    const noTerm = await get('/api/search?limit=10', memberToken);
    check('search without a term is rejected', noTerm.status === 400, `${noTerm.status}`);

    /* ------------------------------------------------------------------ */
    // A photo the user picked for THEMSELVES. The profile form used to take a
    // pasted image URL, so the only people with an avatar were the ones who
    // happened to host an image somewhere. Same storage engine as section 11, so
    // the same guarantees are asserted: bytes served, permission enforced, and no
    // orphan file when the upload is refused.
    section('12. profile avatar (a photo the user picked for themselves)');
    const uploadAvatarFor = async (token, { type = 'image/png', ...rest } = {}) => {
      const form = new FormData();
      form.append('image', new Blob([rest.bytes || PNG_BYTES], { type }), 'e2e-avatar.png');
      const res = await fetch(`${BASE}/api/profile/avatar`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    };

    const filesBeforeAvatar = storedFiles();
    const avatar = await uploadAvatarFor(memberToken);
    check('a member can upload their own avatar',
      avatar.status === 200 && Boolean(avatar.data?.avatarUrl),
      `${avatar.status} ${avatar.data?.message || ''}`);
    check('the avatar is stored under /uploads',
      String(avatar.data?.avatarUrl || '').startsWith('/uploads/'), avatar.data?.avatarUrl || 'missing');
    check('an accepted avatar adds exactly one stored file',
      storedFiles() === filesBeforeAvatar + 1, `${filesBeforeAvatar} -> ${storedFiles()}`);

    const avatarServed = await fetch(`${BASE}${avatar.data?.avatarUrl}`);
    check('the stored avatar is served back from /uploads',
      avatarServed.status === 200 && (avatarServed.headers.get('content-type') || '').includes('image/png'),
      `${avatarServed.status} ${avatarServed.headers.get('content-type') || ''}`);

    const profileAfterAvatar = await get('/api/profile', memberToken);
    check('GET /api/profile reports the new avatar',
      profileAfterAvatar.data?.user?.avatarUrl === avatar.data?.avatarUrl,
      profileAfterAvatar.data?.user?.avatarUrl || 'missing');

    // The topbar, the member roster and every card render the same URL, so the
    // directory is the cross-check that this one write is visible elsewhere.
    const roster = await get('/api/directory', admin.token);
    check('the avatar reaches the roster other members see',
      (roster.data?.members || []).some(m => m.avatarUrl === avatar.data?.avatarUrl),
      `${(roster.data?.members || []).length} members`);

    const avatarAudit = await get('/api/audit-logs?action=PROFILE_AVATAR_UPDATED&limit=20', admin.token);
    check('the avatar upload is written to the audit log',
      (avatarAudit.data?.logs || []).length > 0, `${avatarAudit.data?.logs?.length ?? 'undefined'} rows`);

    const filesBeforeBadAvatar = storedFiles();
    const notAnAvatar = await uploadAvatarFor(memberToken,
      { type: 'text/plain', bytes: Buffer.from('definitely not a photo') });
    check('a file that is not an image is refused as an avatar', notAnAvatar.status === 400, `${notAnAvatar.status}`);
    check('a refused avatar leaves no file behind',
      storedFiles() === filesBeforeBadAvatar, `${filesBeforeBadAvatar} -> ${storedFiles()}`);
    check('an avatar upload without a session is refused',
      (await uploadAvatarFor(null)).status === 401, '401');

    /* ------------------------------------------------------------------ */
    // The organization logo. The branding step downscales in the browser and
    // sends the image inline as a data URL, but `logoUrl` shared the profile's
    // 2000-character url() cap — so every real logo was rejected with a 400 and
    // the wizard reassured the user that their logo "could not be saved".
    section('13. organization logo (branding image stored on the tenant)');
    const logoDataUrl = `data:image/png;base64,${'iVBORw0KGgoAAAANSUhEUg'.repeat(450)}`;
    check('the test logo is larger than the old 2000 character cap',
      logoDataUrl.length > 2000, `${logoDataUrl.length} chars`);

    const withLogo = await post('/api/organizations/create', admin.token, {
      name: 'E2E Upload Check',
      type: 'school',
      emailDomain: 'e2e-upload-check.dev',
      location: 'Test Lane',
      logoUrl: logoDataUrl
    });
    check('an organization can be created with a logo',
      (withLogo.status === 200 || withLogo.status === 201) && withLogo.data?.organization?.logoUrl === logoDataUrl,
      `${withLogo.status} ${String(withLogo.data?.organization?.logoUrl || '').length} chars`);

    const uploadOrgId = withLogo.data?.organization?.id;
    const reBranded = await call('PATCH', `/api/organizations/${uploadOrgId}`,
      { token: admin.token, body: { logoUrl: logoDataUrl } });
    check('the branding step can replace the logo',
      reBranded.status === 200 && reBranded.data?.organization?.logoUrl === logoDataUrl,
      `${reBranded.status} ${String(reBranded.data?.organization?.logoUrl || '').length} chars`);

    const oversizedLogo = await call('PATCH', `/api/organizations/${uploadOrgId}`,
      { token: admin.token, body: { logoUrl: `data:image/png;base64,${'A'.repeat(400001)}` } });
    check('an oversized logo is still refused', oversizedLogo.status === 400, `${oversizedLogo.status}`);
  } finally {
    stop();
  }
  /* ------------------------------------------------------------------ */
  // eslint-disable-next-line no-console
  console.log(`\n${'='.repeat(60)}`);
  const total = passed + failures.length;
  // eslint-disable-next-line no-console
  console.log(`${passed}/${total} checks passed`);
  if (failures.length) {
    // eslint-disable-next-line no-console
    console.log(`failed: ${failures.join(' | ')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`\n[e2e] fatal: ${err.message}`);
  process.exitCode = 1;
});
