/**
 * Reseeds whichever store the app would actually use.
 *
 *   node scripts/reseedLive.js
 *
 * `scripts/reset.js` always targets MongoDB. This one asks the store the same
 * question the server asks at boot (explicit DATA_MODE, else a reachable Mongo,
 * else memory) and then re-seeds that store, so a demo machine with Mongo running
 * and a demo machine without it both end up with the current seed data.
 */
require('dotenv').config();

(async () => {
  const { initStore, storeMode } = require('../src/store');
  const { seed } = require('../src/store/seed');

  await initStore();
  console.log(`[reseed] store mode: ${storeMode()}`);

  const store = require('../src/store').getDriver();
  const orgs = await store.listOrgs();
  if (orgs.length > 0 && storeMode() === 'memory') {
    // The memory store lives in this process only, so there is nothing to clear;
    // it will seed itself on the next boot of the server.
    console.log(`[reseed] memory store already holds ${orgs.length} orgs — restart the server to reseed`);
    process.exit(0);
  }

  if (storeMode() === 'mongo') {
    const mongoose = require('mongoose');
    const config = require('../src/config');
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    console.log(`[reseed] dropped ${config.mongoUri}`);
    // Re-initialise so the driver caches nothing from the dropped database.
    await initStore();
  }

  await seed();
  const { getDriver } = require('../src/store');
  const after = await getDriver();
  const { reports } = await after.listReports((await after.listOrgs())[0].id, { limit: 500 });
  console.log(`[reseed] first org now holds ${reports.length} reports`);
  process.exit(0);
})().catch((err) => {
  console.error('[reseed] failed:', err.message);
  process.exit(1);
});
