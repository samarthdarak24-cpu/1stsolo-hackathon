/**
 * Store bootstrap — picks a driver at boot.
 *
 * Priority: explicit DATA_MODE ("memory" | "mongo") > reachable MongoDB > memory.
 * Both drivers implement the identical async interface, so controllers, services
 * and seed logic never care which one is active.
 */
const mongoose = require('mongoose');
const config = require('../config');

let driver = null;

async function initStore() {
  const mode = config.dataMode;

  if (mode === 'postgres' || mode === 'postgresql') {
    if (!config.databaseUrl) throw new Error('DATA_MODE=postgres but DATABASE_URL is not set');
    driver = require('./postgresDriver');
    await driver.init(config.databaseUrl);
    console.log('[store] PostgreSQL connected');
    return driver;
  }

  if (mode !== 'memory') {
    try {
      await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 2500 });
      driver = require('./mongoDriver');
      // eslint-disable-next-line no-console
      console.log(`[store] MongoDB connected (${config.mongoUri})`);
      return driver;
    } catch (err) {
      if (mode === 'mongo') {
        throw new Error(`DATA_MODE=mongo but MongoDB unreachable at ${config.mongoUri}: ${err.message}`);
      }
      // eslint-disable-next-line no-console
      console.warn(`[store] MongoDB unreachable (${err.message}) — using in-memory store.`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('[store] DATA_MODE=memory — using in-memory store.');
  }

  try { await mongoose.disconnect(); } catch { /* ignore */ }
  driver = require('./memoryDriver');
  return driver;
}

const getDriver = () => {
  if (!driver) throw new Error('Store not initialised');
  return driver;
};

const storeMode = () => (driver ? driver.mode : 'uninitialised');

module.exports = { initStore, getDriver, storeMode, MONGO_URI: config.mongoUri };
