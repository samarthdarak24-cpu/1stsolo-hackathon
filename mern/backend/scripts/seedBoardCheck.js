/**
 * Verifies the recovery-board seed data without touching a real database.
 *
 *   node scripts/seedBoardCheck.js
 *
 * Boots the store in DATA_MODE=memory, runs the seed, and asserts that ABC School
 * and XYZ Company each end up with ten detailed items: a lost/found pair with a
 * real image, a fully filled itemProfile, a match, and (for claimed items) a
 * verification, a return with a live one-time QR and a chain-of-custody trail.
 * Exit code 0 only when every check passed.
 */
process.env.DATA_MODE = 'memory';

const { initStore, getDriver } = require('../src/store');
const { seed } = require('../src/store/seed');

let passed = 0;
const failures = [];

function check(label, ok, detail = '') {
  // eslint-disable-next-line no-console
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
  if (ok) passed += 1;
  else failures.push(label);
}

const FIELDS = ['itemName', 'category', 'primaryColor', 'secondaryColor', 'brand', 'model',
  'material', 'shape', 'size', 'condition', 'visibleMark', 'estimatedValue'];

// Only the recovery-board items are asserted for a fully filled profile: the
// older base demo rows (backpack, flask, umbrella...) were deliberately written
// with a few blanks, and rewriting them here would change existing matches.
const BOARD_ITEMS = new Set([
  'Black Handbag', 'Blue Tablet', 'Silver Watch', 'Black Headphones', 'Black Sunglasses',
  'Teal Water Bottle', 'Navy Track Pants', 'Silver Laptop Stand', 'Grey Wireless Mouse', 'Student ID Card',
  'Black Notebook', 'Green Umbrella', 'White Charger Brick', 'Brown Sunglasses', 'Orange Coffee Mug',
  'Red Hoodie', 'Black Earbuds', 'Leather Notebook', 'Black Phone Pouch', 'White Laptop Charger'
]);

(async () => {
  await initStore();
  await seed();
  const store = getDriver();
  const orgs = await store.listOrgs();

  for (const orgName of ['ABC School', 'XYZ Company']) {
    const org = orgs.find((o) => o.name === orgName);
    /* eslint-disable no-await-in-loop */
    check(`${orgName} exists`, Boolean(org));
    if (!org) continue;

    const { reports } = await store.listReports(org.id, { limit: 500 });
    const lost = reports.filter((r) => r.type === 'LOST');
    const found = reports.filter((r) => r.type === 'FOUND');
    check(`${orgName} has >= 10 lost and >= 10 found reports`, lost.length >= 10 && found.length >= 10,
      `lost=${lost.length} found=${found.length}`);

    const boardItems = [...new Set(reports.map((r) => r.itemProfile?.itemName).filter(Boolean))];
    check(`${orgName} shows >= 10 distinct item names`, boardItems.length >= 10, `${boardItems.length}`);

    const withImage = reports.filter((r) => Array.isArray(r.images) && r.images.length > 0 && r.images[0]);
    check(`${orgName} reports all carry an image`, withImage.length === reports.length,
      `${withImage.length}/${reports.length}`);

    const boardReports = reports.filter((r) => BOARD_ITEMS.has(r.itemProfile?.itemName));
    check(`${orgName} has 10 board items filed twice (20 reports)`, boardReports.length === 20,
      `${boardReports.length}`);

    const missing = [];
    for (const r of boardReports) {
      const p = r.itemProfile || {};
      const gaps = FIELDS.filter((f) => !String(p[f] || '').trim());
      if (gaps.length) missing.push(`${r.itemProfile.itemName}:${gaps.join(',')}`);
    }
    check(`${orgName} every board itemProfile is fully filled`, missing.length === 0, missing.slice(0, 3).join(' | '));

    const thin = boardReports.filter((r) => String(r.description || '').trim().length < 40);
    check(`${orgName} every board description is substantial`, thin.length === 0, `${thin.length} short`);

    const imgless = boardReports.filter((r) => !(Array.isArray(r.images) && r.images[0]));
    check(`${orgName} every board report has an image`, imgless.length === 0, `${imgless.length} without`);

    const { matches } = await store.listMatches(org.id, { limit: 500 });
    check(`${orgName} every item has a match`, matches.length >= 10, `${matches.length}`);

    const verified = await store.listVerifications(org.id, { status: 'VERIFIED' });
    check(`${orgName} has verified claims`, verified.length >= 2, `${verified.length}`);

    const returns = await store.listReturns(org.id, { limit: 500 });
    const ready = returns.filter((r) => r.status === 'READY');
    const done = returns.filter((r) => r.status === 'COMPLETED');
    check(`${orgName} has ready returns with a live QR`, ready.length >= 2 && ready.every((r) => r.qrToken && r.otp),
      `ready=${ready.length} completed=${done.length}`);
    check(`${orgName} has completed returns`, done.length >= 2, `${done.length}`);

    const custody = await store.listCustodyRecords(org.id, { limit: 500 });
    check(`${orgName} has chain-of-custody entries`, custody.total >= 5, `${custody.total}`);

    const returned = reports.filter((r) => r.status === 'RETURNED');
    check(`${orgName} closed cases are marked RETURNED`, returned.length >= 2, `${returned.length}`);
    /* eslint-enable no-await-in-loop */
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
  console.error('[seedBoardCheck] crashed:', err);
  process.exit(1);
});