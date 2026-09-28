/**
 * AI job queue.
 *
 * Report submission must NOT wait for model inference - a 30s embedding call
 * inside a request handler would time out, hold a DB connection and make the
 * product feel broken. So report creation returns immediately and enqueues
 * `match:report`; the worker does detection, embedding, retrieval and matching
 * out of band, then notifies the user.
 *
 * Two drivers behind one interface:
 *   - BullMQ + Redis when REDIS_URL is set (survives restarts, scales to
 *     several API instances)
 *   - an in-process queue otherwise, so a clone-and-run works with no
 *     infrastructure at all
 *
 * The in-process driver journals its unfinished jobs to disk (config.queue.
 * statePath) and replays them on boot. Without that, restarting the API while
 * a `match:report` job was queued left the user's report stuck at MATCHING
 * forever - Redis persists for free, so the fallback should not be the one
 * path that silently loses work.
 *
 * Both expose `add`, `process`, `mode` and `close`.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');

const QUEUE_NAME = 'lostlink-ai';
let driver = null;
let initPromise = null;

class InProcessQueue {
  constructor(name, statePath) {
    this.name = name;
    this.mode = 'in-process';
    this.handlers = new Map();
    this.concurrency = config.queue.concurrency;
    this.pending = 0;
    this.completed = 0;
    this.failed = 0;
    // Sequential drain loop; jobs are cheap to enqueue and must not block boot.
    this.draining = false;
    this.statePath = statePath || config.queue.statePath;
    // Jobs that are in flight right now. They stay in the journal until they
    // finish, so a crash mid-job replays it on the next boot (matching is
    // idempotent, so a repeat is safe and better than a silent drop).
    this.running = new Map();
    this.queue = this.restore();
  }

  /** Reads unfinished jobs from the journal. A missing or corrupt file must
   *  never stop the API from booting - worst case we lose one replay. */
  restore() {
    try {
      if (!this.statePath || !fs.existsSync(this.statePath)) return [];
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      if (!Array.isArray(parsed) || !parsed.length) return [];
      this.restored = parsed.length;
      console.log(`[aiQueue] restored ${parsed.length} unfinished job(s) from ${this.statePath}`);
      return parsed;
    } catch (err) {
      console.warn(`[aiQueue] could not read queue journal (${err.message}) - starting empty.`);
      return [];
    }
  }

  /** Writes the journal atomically: a crash mid-write leaves the previous file
   *  intact instead of a truncated one that fails to parse next boot. */
  persist() {
    if (!this.statePath) return;
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      const tmp = `${this.statePath}.tmp`;
      const jobs = [...this.running.values(), ...(this.queue || [])];
      fs.writeFileSync(tmp, JSON.stringify(jobs));
      fs.renameSync(tmp, this.statePath);
    } catch (err) {
      console.warn(`[aiQueue] could not journal queue state: ${err.message}`);
    }
  }

  async add(jobName, data, { attempts } = {}) {
    this.queue = this.queue || [];
    const job = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: jobName,
      data,
      attempts: attempts || config.queue.attempts
    };
    this.queue.push(job);
    this.persist();
    // setImmediate so the caller's response is never delayed by the work.
    setImmediate(() => this.drain());
    return job;
  }

  async process(jobName, handler) {
    this.handlers.set(jobName, handler);
    // Jobs restored from the journal have no handler until now: drain them.
    if (this.queue && this.queue.length) setImmediate(() => this.drain());
    return this;
  }

  async drain() {
    if (this.draining) return;
    this.draining = true;
    this.queue = this.queue || [];
    while (this.queue.length) {
      const job = this.queue.shift();
      const handler = this.handlers.get(job.name);
      if (!handler) {
        this.failed += 1;
        // Unknown job name: drop it from the journal so it cannot wedge the
        // queue on every future boot.
        this.persist();
        continue;
      }
      this.running.set(job.id, job);
      this.persist();
      this.pending += 1;
      try {
        // eslint-disable-next-line no-await-in-loop
        await handler(job);
        this.completed += 1;
      } catch (err) {
        this.failed += 1;
        console.error(`[aiQueue] job ${job.name} (${job.id}) failed:`, err.message);
      } finally {
        this.pending -= 1;
        this.running.delete(job.id);
        this.persist();
      }
    }
    this.draining = false;
  }

  stats() {
    return {
      mode: this.mode,
      pending: this.pending,
      completed: this.completed,
      failed: this.failed,
      restored: this.restored || 0
    };
  }

  async close() {
    // Leave the journal alone: whatever is pending should be replayed by the
    // next process rather than discarded on shutdown.
    this.queue = [];
  }
}

class BullQueue {
  constructor(name, bull) {
    this.name = name;
    this.mode = 'bullmq';
    this.Queue = bull.Queue;
    this.Worker = bull.Worker;
    this.queue = new this.Queue(name, {
      connection: config.queue.redisUrl,
      defaultJobOptions: {
        attempts: config.queue.attempts,
        // Matching is idempotent, so a retry is always safe.
        removeOnComplete: 200,
        removeOnFail: 100
      }
    });
    this.worker = null;
  }

  async add(jobName, data, opts) {
    return this.queue.add(jobName, data, opts);
  }

  async process(jobName, handler) {
    this.worker = new this.Worker(
      this.name,
      async (job) => handler({ id: job.id, name: job.name, data: job.data }),
      {
        connection: config.queue.redisUrl,
        concurrency: config.queue.concurrency
      }
    );
    this.worker.on('failed', (job, err) => {
      console.error(`[aiQueue] job ${job.name} (${job.id}) failed:`, err.message);
    });
    return this;
  }

  async stats() {
    const counts = await this.queue.getJobCounts();
    return { mode: this.mode, ...counts };
  }

  async close() {
    if (this.worker) await this.worker.close();
    await this.queue.close();
  }
}

async function initQueue() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!config.queue.redisUrl) {
      driver = new InProcessQueue(QUEUE_NAME);
      console.log('[aiQueue] REDIS_URL not set - using the journalled in-process queue.');
      return driver;
    }
    try {
      // eslint-disable-next-line global-require
      const bull = require('bullmq');
      driver = new BullQueue(QUEUE_NAME, bull);
      console.log('[aiQueue] connected to Redis via BullMQ.');
    } catch (err) {
      console.warn(
        `[aiQueue] BullMQ unavailable (${err.message}) - using the in-process queue.`
      );
      driver = new InProcessQueue(QUEUE_NAME);
    }
    return driver;
  })();

  return initPromise;
}

/** Idempotent: safe to call from several modules. */
async function getQueue() {
  if (driver) return driver;
  return initQueue();
}

function queueMode() {
  return driver ? driver.mode : 'uninitialised';
}

async function queueStats() {
  const q = await getQueue();
  return q.stats();
}

async function closeQueue() {
  if (driver) await driver.close();
  driver = null;
  initPromise = null;
}

module.exports = { initQueue, getQueue, queueMode, queueStats, closeQueue, QUEUE_NAME };
