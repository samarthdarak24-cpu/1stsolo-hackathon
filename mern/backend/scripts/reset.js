/**
 * Dev utility: drop the LostLink database and re-seed it.
 * Usage: npm run reset
 */
require('dotenv').config();
const config = require('../src/config');

(async () => {
  if (config.dataMode === 'postgres' || config.dataMode === 'postgresql') {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: config.databaseUrl });
    await pool.query('DELETE FROM lostlink_state WHERE id = 1');
    await pool.end();
    console.log('[reset] cleared PostgreSQL state');
  } else {
    const mongoose = require('mongoose');
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 3000 });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    console.log(`[reset] dropped ${config.mongoUri}`);
  }

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
