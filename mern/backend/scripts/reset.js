/**
 * Dev utility: drop the LostLink database and re-seed it.
 * Usage: npm run reset
 */
require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config');

(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 3000 });
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log(`[reset] dropped ${config.mongoUri}`);

  // Re-initialise the store and re-run the seed against the now-empty database.
  const { initStore } = require('../src/store');
  const { seed } = require('../src/store/seed');
  await initStore();
  await seed();
  process.exit(0);
})().catch((err) => {
  console.error('[reset] failed:', err.message);
  process.exit(1);
});
