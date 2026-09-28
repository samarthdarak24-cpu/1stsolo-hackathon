/**
 * Centralised runtime configuration.
 * Every module reads config from here instead of touching process.env directly.
 */
require('dotenv').config();

const path = require('path');

const isProd = process.env.NODE_ENV === 'production';

const config = {
  isProd,
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lostlink',
  dataMode: (process.env.DATA_MODE || 'auto').toLowerCase(),
  jwt: {
    secret: process.env.JWT_SECRET || 'lostlink-dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    issuer: 'lostlink-ai'
  },
  uploads: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxBytes: Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024),
    allowedMime: ['image/jpeg', 'image/png', 'image/webp']
  },
  return: {
    qrTtlMinutes: Number(process.env.QR_TTL_MINUTES || 15),
    pickupLocation: process.env.DEFAULT_PICKUP_LOCATION || 'Security Desk'
  },
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX || 600),
    authMax: Number(process.env.RATE_LIMIT_AUTH_MAX || 40)
  },
  // Matching signal weights (spec: configurable in backend, not presented as validated science)
  matching: {
    weights: {
      visual: Number(process.env.W_VISUAL ?? 35),
      semantic: Number(process.env.W_SEMANTIC ?? 20),
      attributes: Number(process.env.W_ATTRIBUTES ?? 15),
      location: Number(process.env.W_LOCATION ?? 10),
      time: Number(process.env.W_TIME ?? 10),
      context: Number(process.env.W_CONTEXT ?? 10)
    },
    windowDays: Number(process.env.MATCH_WINDOW_DAYS || 14),
    minScore: Number(process.env.MATCH_MIN_SCORE || 35),
    topN: Number(process.env.MATCH_TOP_N || 5),
    highConfidence: Number(process.env.MATCH_HIGH_CONFIDENCE || 85)
  },

  // Python inference service. This is where every ML model lives, so the
  // Express event loop never carries torch. If it is unreachable the AI layer
  // degrades to the built-in heuristic scorer and says so - it never blocks
  // report submission.
  ai: {
    serviceUrl: (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8100').replace(/\/$/, ''),
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 120000),
    // When false, /api/ai/* never attempts a network call (useful in tests).
    enabled: (process.env.AI_ENABLED || 'true').toLowerCase() !== 'false'
  },

  // Email notifications. Optional by design: in-app + SSE always work, and the
  // mailer reports "not configured" rather than pretending to deliver. See
  // services/mailService.js for the driver ladder.
  mail: {
    // auto | smtp | webhook | log | off
    driver: (process.env.MAIL_DRIVER || 'auto').toLowerCase(),
    from: process.env.MAIL_FROM || '',
    // Any HTTP relay (Resend/Mailgun/SES bridge/company relay).
    webhookUrl: process.env.MAIL_WEBHOOK_URL || '',
    smtp: {
      host: process.env.MAIL_SMTP_HOST || '',
      port: Number(process.env.MAIL_SMTP_PORT || 587),
      secure: (process.env.MAIL_SMTP_SECURE || '').toLowerCase() === 'true',
      user: process.env.MAIL_SMTP_USER || '',
      pass: process.env.MAIL_SMTP_PASS || ''
    },
    timeoutMs: Number(process.env.MAIL_TIMEOUT_MS || 10000)
  },

  // Background job queue. Redis + BullMQ when REDIS_URL is set, otherwise an
  // in-process queue with the same interface so the product still works with
  // no extra infrastructure.
  queue: {
    redisUrl: process.env.REDIS_URL || '',
    concurrency: Number(process.env.AI_WORKER_CONCURRENCY || 2),
    // Attempts per job; matching is idempotent so a retry is safe.
    attempts: Number(process.env.AI_JOB_ATTEMPTS || 3),
    // Where the in-process driver journals unfinished jobs. Redis already
    // persists when it is configured, so this only matters for the
    // no-infrastructure path - but there a restart used to drop a match job
    // that a user was already waiting on.
    statePath: process.env.AI_QUEUE_STATE || path.join(process.cwd(), '.cache', 'ai-queue.json')
  },

  // Object storage. When S3_* is set the upload middleware stores bytes in an
  // S3-compatible bucket instead of the local disk (needed for deploys with an
  // ephemeral filesystem). Unset = disk, which is what a clone-and-run uses.
  storage: {
    driver: (process.env.STORAGE_DRIVER || 'auto').toLowerCase(),
    publicBaseUrl: (process.env.STORAGE_PUBLIC_BASE_URL || '').replace(/\/$/, ''),
    s3: {
      bucket: process.env.S3_BUCKET || '',
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      prefix: process.env.S3_PREFIX || 'uploads'
    }
  }
};

if (isProd && config.jwt.secret === 'lostlink-dev-secret-change-me') {
  // eslint-disable-next-line no-console
  console.warn('[config] WARNING: JWT_SECRET is still the development default in production.');
}

module.exports = config;
