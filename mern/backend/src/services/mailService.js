/**
 * Mail transport — optional, provider-agnostic, and honest when unconfigured.
 *
 * Nothing in this build requires a mail server, and the app must never break
 * because SMTP is missing: an operator who clones and runs gets in-app + SSE
 * notifications and a single startup line saying email is off. So the service is
 * a small ladder, chosen by `MAIL_DRIVER`:
 *
 *   auto (default) - SMTP when it is configured AND `nodemailer` is installed,
 *                    otherwise the webhook if one is set, otherwise nothing
 *   smtp           - SMTP only; a failure is reported, never thrown at a caller
 *   webhook        - POSTs JSON to `MAIL_WEBHOOK_URL` (Mailgun/Resend/SES relay,
 *                    or a company relay) using the built-in fetch
 *   log            - writes the message to the backend log (staging / demos)
 *   off            - disabled outright
 *
 * `nodemailer` is a *peer* dependency, not a hard one: it is loaded lazily so the
 * backend keeps working from a plain `npm install`. Whichever driver is active,
 * the interface is the same and every outcome names what actually happened.
 */
const config = require('../config');

let nodemailer = null;
let nodemailerTried = false;
let smtpTransport = null;
let announcerShown = false;

const stats = {
  sent: 0,
  skipped: 0,
  failed: 0,
  lastAt: null,
  lastStatus: null,
  lastReason: null,
  lastError: null
};

/** Lazily requires nodemailer. Undefined (not a throw) when it is not installed. */
function loadNodemailer() {
  if (nodemailerTried) return nodemailer;
  nodemailerTried = true;
  try {
    // eslint-disable-next-line global-require
    nodemailer = require('nodemailer');
  } catch {
    nodemailer = null;
  }
  return nodemailer;
}

const smtpReady = () => Boolean(config.mail.smtp.host && config.mail.from);

/**
 * Which driver will actually run, and why. Exported so /api/health and the ops
 * screen can state the truth instead of implying mail is working.
 */
function describe() {
  const requested = config.mail.driver;
  const webhook = Boolean(config.mail.webhookUrl);
  const smtp = smtpReady();
  const haveNodemailer = Boolean(loadNodemailer());

  if (requested === 'off') return { driver: 'off', configured: false, reason: 'MAIL_DRIVER=off' };

  if (requested === 'log') {
    return { driver: 'log', configured: true, reason: 'Messages are written to the backend log (MAIL_DRIVER=log)' };
  }
  if (requested === 'webhook') {
    return webhook
      ? { driver: 'webhook', configured: true, reason: 'HTTP relay configured' }
      : { driver: 'none', configured: false, reason: 'MAIL_DRIVER=webhook but MAIL_WEBHOOK_URL is empty' };
  }
  if (requested === 'smtp') {
    if (!smtp) return { driver: 'none', configured: false, reason: 'MAIL_DRIVER=smtp but MAIL_SMTP_HOST/MAIL_FROM are empty' };
    if (!haveNodemailer) return { driver: 'none', configured: false, reason: 'nodemailer is not installed (npm i nodemailer)' };
    return { driver: 'smtp', configured: true, reason: `SMTP via ${config.mail.smtp.host}` };
  }

  // auto
  if (smtp && haveNodemailer) return { driver: 'smtp', configured: true, reason: `SMTP via ${config.mail.smtp.host}` };
  if (smtp && !haveNodemailer) return { driver: 'webhook', ...(webhook
    ? { configured: true, reason: 'SMTP host set but nodemailer is missing — using the webhook relay' }
    : { driver: 'none', configured: false, reason: 'SMTP host set but nodemailer is not installed (npm i nodemailer)' }) };
  if (webhook) return { driver: 'webhook', configured: true, reason: 'HTTP relay configured' };
  return { driver: 'none', configured: false, reason: 'No mail transport configured (set MAIL_SMTP_HOST or MAIL_WEBHOOK_URL)' };
}

/** One startup line, so an operator is never guessing whether email works. */
function announce() {
  if (announcerShown) return;
  announcerShown = true;
  const d = describe();
  if (d.configured) {
    // eslint-disable-next-line no-console
    console.log(`[mail] email notifications enabled — ${d.driver}: ${d.reason}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[mail] email notifications off — ${d.reason}. In-app and live notifications still work.`);
  }
}

function getSmtpTransport() {
  if (smtpTransport) return smtpTransport;
  const mailer = loadNodemailer();
  if (!mailer || !smtpReady()) return null;
  const { host, port, secure, user, pass } = config.mail.smtp;
  smtpTransport = mailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    // A hung SMTP server must not keep an unhandled promise alive forever.
    connectionTimeout: config.mail.timeoutMs
  });
  return smtpTransport;
}

const record = (status, reason, error) => {
  stats.lastAt = new Date().toISOString();
  stats.lastStatus = status;
  stats.lastReason = reason || null;
  stats.lastError = error || null;
  if (status === 'sent') stats.sent += 1;
  else if (status === 'skipped') stats.skipped += 1;
  else stats.failed += 1;
};

/**
 * Sends one message. NEVER throws and never rejects: a notification that could
 * not be emailed is still a notification the user can see in the app, so the
 * caller must not have to defend against a dead relay.
 */
async function send({ to, subject, text, html, meta } = {}) {
  const decided = describe();
  announce();

  if (!decided.configured) return finish({ status: 'skipped', driver: decided.driver, reason: decided.reason });
  if (!to) return finish({ status: 'skipped', driver: decided.driver, reason: 'recipient has no email address' });

  const from = config.mail.from || 'LostLink AI <no-reply@lostlink.local>';
  const message = { from, to, subject: subject || 'LostLink AI', text: text || '', html: html || undefined };

  try {
    if (decided.driver === 'log') {
      // eslint-disable-next-line no-console
      console.log(`[mail:log] to=${to} subject="${message.subject}"\n${message.text}`);
      return finish({ status: 'sent', driver: 'log', reason: 'written to the backend log' });
    }

    if (decided.driver === 'webhook') {
      const res = await fetch(config.mail.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from, ...message, meta: meta || {} }),
        signal: AbortSignal.timeout(config.mail.timeoutMs)
      });
      if (!res.ok) throw new Error(`relay responded ${res.status}`);
      return finish({ status: 'sent', driver: 'webhook' });
    }

    const transport = getSmtpTransport();
    if (!transport) return finish({ status: 'skipped', driver: 'none', reason: 'SMTP transport unavailable' });
    const info = await transport.sendMail(message);
    return finish({ status: 'sent', driver: 'smtp', messageId: info.messageId });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[mail] send to ${to} failed (${decided.driver}): ${err.message}`);
    return finish({ status: 'failed', driver: decided.driver, reason: err.message });
  }
}

function finish(result) {
  record(result.status, result.reason, result.status === 'failed' ? result.reason : null);
  return result;
}

/** Counters surfaced on the ops status surface. Never throws. */
const mailStats = () => ({ ...stats, transport: describe().driver, configured: describe().configured });

/** Test/ops helper: drops the cached transport after a config change. */
function resetTransport() {
  smtpTransport = null;
  nodemailerTried = false;
  nodemailer = null;
}

module.exports = { send, describe, mailStats, announce, resetTransport };
