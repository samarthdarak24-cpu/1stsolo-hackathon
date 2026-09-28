/**
 * Custody hash-chain check.
 *
 * Run with:  node scripts/custodyChainCheck.js
 *
 * Proves the property the ledger exists for: an unchanged chain verifies, and a
 * row edited after the fact is detected and named. It writes a throwaway item's
 * chain directly through the store (no HTTP), verifies, tampers with one row,
 * verifies again, then deletes what it created.
 *
 * Exit code 0 means detection works.
 */
require('dotenv').config();

const { initStore, getDriver } = require('../src/store');
const { sealRecord, verifyChain } = require('../src/services/custodyChain');

const TAG = 'custody-chain-check';

async function main() {
  await initStore();
  const store = getDriver();
  const stamp = Date.now();

  // A throwaway report to hang the chain on. It never reaches a real user: the
  // unique reference and the cleanup below keep it out of every listing.
  const report = await store.createReport({
    organizationId: TAG,
    userId: `${TAG}-user`,
    type: 'FOUND',
    category: 'Probe',
    reference: `CHAIN-CHECK-${stamp}`,
    description: 'Throwaway item used by scripts/custodyChainCheck.js',
    location: 'Test bench',
    status: 'REPORTED',
    images: [],
    itemProfile: { itemName: 'Chain check probe' }
  });

  const rows = [
    { event: 'LOGGED', toCustodian: 'Intake desk', note: 'Received at the desk.' },
    { event: 'STORED', toCustodian: 'Shelf A3', note: 'Shelved for safekeeping.' },
    { event: 'HANDED_OVER', toCustodian: 'Owner', note: 'Returned at the desk.' }
  ];

  let prevHash = '';
  const created = [];
  for (const row of rows) {
    const sealed = sealRecord(
      {
        organizationId: TAG,
        reportId: report.id,
        matchId: null,
        returnId: null,
        event: row.event,
        fromCustodian: prevHash ? 'Held by previous custodian' : '',
        toCustodian: row.toCustodian,
        location: 'Test bench',
        note: row.note,
        evidence: [],
        actorUserId: null,
        actorName: 'Chain check',
        occurredAt: new Date()
      },
      prevHash
    );
    // eslint-disable-next-line no-await-in-loop
    const saved = await store.createCustodyRecord(sealed);
    created.push(saved.id);
    prevHash = saved.hash;
  }

  const chain = await store.listCustodyRecordsForReport(report.id);
  if (chain.length !== rows.length) {
    console.error(`FAIL: expected ${rows.length} rows, found ${chain.length}`);
    return 1;
  }

  const clean = verifyChain(chain);
  console.log('clean chain:', JSON.stringify(clean));
  if (!clean.valid || clean.checked !== rows.length) {
    console.error('FAIL: an untouched chain did not verify.');
    return 1;
  }

  // --- tamper ---------------------------------------------------------------
  // Straight to the collection, bypassing the service: exactly what someone
  // "correcting" the record after the fact would do.
  const Models = require('../src/models');
  const target = chain[1];
  await Models.CustodyRecord.updateOne({ _id: target.id }, { $set: { note: 'Edited after the fact' } });

  const tampered = await store.listCustodyRecordsForReport(report.id);
  const result = verifyChain(tampered);
  console.log('after tamper:', JSON.stringify(result));

  if (result.valid) {
    console.error('FAIL: an edited row still verified - the chain proves nothing.');
    return 1;
  }
  if (result.brokenAt?.id !== target.id) {
    console.error(`FAIL: detected ${result.brokenAt?.id}, expected the edited row ${target.id}`);
    return 1;
  }

  // --- cleanup --------------------------------------------------------------
  // The store has no deleteCustodyRecord, so the rows go through the model the
  // same way the tamper above did.
  await Models.CustodyRecord.deleteMany({ reportId: String(report.id) });
  await store.deleteReport(report.id).catch(() => null);

  console.log(`PASS: chain verified (${clean.checked} rows), edit detected at row ${target.id} (${result.reason}).`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('custodyChainCheck failed:', err.message);
    process.exit(1);
  });
