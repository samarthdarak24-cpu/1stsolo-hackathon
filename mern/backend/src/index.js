require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const config = require('./config');
const { initStore, storeMode } = require('./store');
const { seed } = require('./store/seed');
const { AppError } = require('./utils/errors');
const { apiLimiter } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const orgRoutes = require('./routes/organizations');
const apiRoutes = require('./routes/api');

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Uploaded item images are served read-only.
app.use('/uploads', express.static(path.resolve(process.cwd(), config.uploads.dir), { maxAge: '7d' }));

// Keep older frontend bundles working while they transition off the duplicated API prefix.
app.use('/api/api/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/organizations', orgRoutes);
app.use('/api', apiLimiter, apiRoutes);

// 404 for unknown API routes (must come after all routers).
app.use('/api', (req, res) => res.status(404).json({ message: `No API route for ${req.method} ${req.originalUrl}` }));

// Central error handler: no stack traces leak to the client.
app.use((err, req, res, _next) => {
  // Multer surfaces file-size/format problems with these codes.
  const multerError = err && typeof err.code === 'string'
    && ['LIMIT_FILE_SIZE', 'LIMIT_UNEXPECTED_FILE', 'LIMIT_FILE_COUNT'].includes(err.code);
  if (multerError) {
    return res.status(400).json({ message: err.message || 'That file could not be accepted' });
  }
  const status = err.status || (err.name === 'ValidationError' ? 400 : 500);
  if (status >= 500) {
    console.error('[error]', err.stack || err.message);
  }
  // An AppError is an outcome we chose (AI disabled, service unreachable, a bad
  // hand-off) - the caller needs to read it. Only UNEXPECTED 5xx failures are
  // masked, so a deliberate 503 never surfaces as "something went wrong".
  const message = status >= 500 && !err.expected
    ? 'Something went wrong on our side. Please try again.'
    : err.message;

  return res.status(status).json({
    message,
    ...(err.details ? { details: err.details } : {})
  });
});

const PORT = config.port;

(async () => {
  await initStore();
  await seed();
  // The AI worker owns every model call. It has to be registered before the
  // first report is created, otherwise matching silently falls back to the
  // heuristic scorer and the app reports scores that no model produced.
  try {
    // eslint-disable-next-line global-require
    const aiWorker = require('./services/aiWorker');
    const mode = await aiWorker.startWorker();
    // eslint-disable-next-line no-console
    console.log(`[queue] ${mode} · AI service: ${config.ai.serviceUrl}`);
  } catch (err) {
    console.warn(`[queue] AI worker could not start (${err.message}) - heuristic matching only.`);
  }
  // One line stating whether email notifications are live, so an operator is
  // never guessing why the mail queue is quiet (see services/mailService.js).
  try {
    // eslint-disable-next-line global-require
    require('./services/mailService').announce();
  } catch (err) {
    console.warn(`[mail] could not initialise the mailer: ${err.message}`);
  }
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[LostLink AI] API on http://localhost:${PORT} (store: ${storeMode()})`);
  });
})().catch((err) => {
  console.error('[fatal] startup failed:', err);
  process.exit(1);
});
