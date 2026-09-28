/**
 * Focused acceptance check for the SSE resume contract in src/realtime/events.js.
 *
 * What it pins down:
 *   - every frame carries an increasing `id:` line
 *   - live delivery honours tenant + user targeting
 *   - a reconnect with ?lastEventId= (or the Last-Event-ID header) replays only
 *     the visible events the client missed, in order, never re-sending acked ids
 *   - a client that stops draining its socket is disconnected (backpressure)
 *
 * Run from mern/backend:   node scripts/sseCheck.js
 * Exit code 0 only when every check passed.
 */
const realtime = require('../src/realtime/events');

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

function makeReq({ user, headers = {}, query = {} }) {
  return {
    user,
    headers,
    query,
    socket: { setTimeout() {}, setNoDelay() {}, setKeepAlive() {} },
    on() { /* the check never closes a connection explicitly */ }
  };
}

function makeRes() {
  const res = {
    chunks: [],
    flushed: true,
    writableLength: 0,
    ended: false,
    write(chunk) { res.chunks.push(String(chunk)); return res.flushed; },
    end() { res.ended = true; },
    writeHead() {}
  };
  return res;
}

const joined = (res) => res.chunks.join('');

async function main() {
  const orgA = 'org-a';
  const orgB = 'org-b';
  const userOne = { id: 'user-1', activeOrgId: orgA };

  // Published while nobody is listening: it may only sit in the replay ring.
  realtime.publish(orgA, { type: 'SYSTEM', payload: { n: 1 } }); // id 1

  const resA = makeRes();
  await realtime.sseHandler(makeReq({ user: userOne, query: { token: 't' } }), resA);
  const a = joined(resA);
  check('a fresh connection is greeted', a.includes(': connected') && a.includes('event: ready'));
  check('no cursor means no replay', !a.includes('id: 1'));

  realtime.publish(orgA, { type: 'VERIFICATION_RESULT', userId: 'user-1', payload: { n: 2 } }); // id 2
  realtime.publish(orgA, { type: 'VERIFICATION_RESULT', userId: 'user-2', payload: { n: 3 } }); // id 3
  realtime.publish(orgA, { type: 'REPORT_UPDATE', payload: { n: 4 } }); // id 4

  const live = joined(resA);
  check('a targeted event reaches only its user', live.includes('id: 2') && !live.includes('id: 3'));
  check('an org broadcast reaches connected members', live.includes('id: 4'));

  // Reconnect with a resume cursor: everything visible after id 2 is replayed.
  const resB = makeRes();
  await realtime.sseHandler(makeReq({ user: userOne, query: { token: 't', lastEventId: '2' } }), resB);
  const replay = joined(resB);
  check('resume replays the missed visible events', replay.includes('id: 4'));
  check('resume does not re-send acknowledged ids', !replay.includes('id: 2'));
  check('resume never crosses user targeting', !replay.includes('id: 3'));

  // The same cursor via the Last-Event-ID header (the spec path browsers use
  // for their own automatic retries).
  const resC = makeRes();
  await realtime.sseHandler(makeReq({ user: userOne, headers: { 'last-event-id': '4' } }), resC);
  check('header form of the cursor is honoured', !joined(resC).includes('id: 4'));

  realtime.publish(orgA, { type: 'REPORT_UPDATE', payload: { n: 5 } }); // id 5
  check('live events after a replay arrive in order',
    joined(resB).indexOf('id: 4') !== -1
    && joined(resB).indexOf('id: 4') < joined(resB).indexOf('id: 5'));

  // Tenant boundary on the replay path.
  const resD = makeRes();
  await realtime.sseHandler(makeReq({ user: { id: 'user-9', activeOrgId: orgB }, query: { lastEventId: '0' } }), resD);
  realtime.publish(orgA, { type: 'REPORT_UPDATE', payload: { n: 6 } }); // id 6
  check('another organization never sees the replay or the live event',
    !joined(resD).includes('id: 6') && !joined(resD).includes('id: 4'));

  // Backpressure: stop draining resA, exceed the buffer cap, and the server
  // must drop the connection instead of buffering forever.
  const before = realtime.connectionCount();
  resA.flushed = false;
  resA.writableLength = 1024 * 1024;
  realtime.publish(orgA, { type: 'REPORT_UPDATE', payload: { n: 7 } }); // id 7
  check('a client that stops reading is disconnected',
    resA.ended && realtime.connectionCount() === before - 1,
    `clients ${before} -> ${realtime.connectionCount()}`);

  const chunksAtDrop = joined(resA).length;
  realtime.publish(orgA, { type: 'REPORT_UPDATE', payload: { n: 8 } }); // id 8
  check('events after the drop never reach the dropped client',
    joined(resA).length === chunksAtDrop);

  const total = passed + failures.length;
  console.log(`\n${passed}/${total} checks passed`);
  if (failures.length) console.log(`failed: ${failures.join(' | ')}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`[sseCheck] fatal: ${err.message}`);
  process.exit(1);
});
