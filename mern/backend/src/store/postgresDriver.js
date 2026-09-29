const { Pool } = require('pg');
const memoryDriver = require('./memoryDriver');

let pool;
let writeQueue = Promise.resolve();

const persist = () => {
  const snapshot = JSON.stringify(memoryDriver._getState());
  writeQueue = writeQueue.then(() => pool.query(
    `INSERT INTO lostlink_state (id, snapshot, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = NOW()`,
    [snapshot]
  ));
  return writeQueue;
};

async function init(databaseUrl) {
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lostlink_state (
      id INTEGER PRIMARY KEY,
      snapshot JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const result = await pool.query('SELECT snapshot FROM lostlink_state WHERE id = 1');
  if (result.rows[0]?.snapshot) {
    memoryDriver._replaceState(result.rows[0].snapshot);
  } else {
    await persist();
  }
}

const postgresDriver = new Proxy({
  mode: 'postgres',
  init
}, {
  get(target, property) {
    if (property in target) return target[property];
    const method = memoryDriver[property];
    if (typeof method !== 'function') return method;
    return async (...args) => {
      const result = await method(...args);
      await persist();
      return result;
    };
  }
});

module.exports = postgresDriver;
