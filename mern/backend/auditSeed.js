/**
 * Seed coverage audit — prints, per organization, how much demo data exists for
 * each feature area, so empty screens are found by measurement, not guesswork.
 * Throwaway: runs with DATA_MODE=memory so no real database is touched.
 */
process.env.DATA_MODE = 'memory';
const { initStore, getDriver } = require('./src/store');
const { seed } = require('./src/store/seed');

const arr = (x) => {
  if (Array.isArray(x)) return x;
  if (!x || typeof x !== 'object') return [];
  return x.items || x.reports || x.matches || x.verifications || x.returns
    || x.records || x.logs || x.notifications || x.members || [];
};
const st = (list) => list.reduce((a, r) => {
  a[r.status] = (a[r.status] || 0) + 1;
  return a;
}, {});

(async () => {
  await initStore();
  await seed();
  const s = getDriver();
  const orgs = await s.listOrgs();
  const out = [];

  for (const o of orgs) {
    const rep = arr(await s.listReports(o.id, { limit: 500 }));
    const matches = arr(await s.listMatches(o.id, { limit: 500 }));
    const verif = arr(await s.listVerifications(o.id, { limit: 500 }));
    const ret = arr(await s.listReturns(o.id, { limit: 500 }));
    const cust = arr(await s.listCustodyRecords(o.id, { limit: 500 }));
    const audit = arr(await s.listAuditLogs(o.id, { limit: 500 }));
    const mem = arr(await s.listMembers(o.id));
    const cctv = rep.filter((x) => (x.cctvEvidence || []).length > 0);

    const withNotif = [];
    for (const m of mem) {
      const uid = m.userId || m.id;
      const n = arr(await s.listNotifications(uid, o.id, { limit: 200 }));
      if (n.length) withNotif.push(uid);
    }

    out.push({
      org: o.name,
      lost: rep.filter((r) => r.type === 'LOST').length,
      found: rep.filter((r) => r.type === 'FOUND').length,
      noImg: rep.filter((r) => !(r.images || []).length).length,
      matches: matches.length,
      verif: verif.length,
      verifStates: JSON.stringify(st(verif)),
      returns: ret.length,
      returnStates: JSON.stringify(st(ret)),
      custody: cust.length,
      cctv: cctv.length,
      audit: audit.length,
      members: mem.length,
      notifUsers: withNotif.length
    });
  }
  console.table(out);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message, e.stack); process.exit(1); });
