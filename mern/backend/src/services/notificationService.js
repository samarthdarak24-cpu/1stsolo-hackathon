/**
 * Notification service — single entry point for creating in-app notifications.
 * Callers never touch the notification collection directly, so preferences and
 * de-duplication rules live in exactly one place.
 */
const { getDriver } = require('../store');
const { AppError } = require('../utils/errors');
const realtime = require('../realtime/events');
const mail = require('./mailService');

const TYPE = {
  NEW_MATCH: 'NEW_MATCH',
  VERIFICATION_REQUIRED: 'VERIFICATION_REQUIRED',
  VERIFICATION_RESULT: 'VERIFICATION_RESULT',
  RETURN_READY: 'RETURN_READY',
  ITEM_RETURNED: 'ITEM_RETURNED',
  REPORT_UPDATE: 'REPORT_UPDATE',
  ORGANIZATION: 'ORGANIZATION',
  SYSTEM: 'SYSTEM'
};

/** Maps a notification type to the user preference that gates it. */
const PREFERENCE_FOR = {
  NEW_MATCH: 'matchAlerts',
  VERIFICATION_REQUIRED: 'verificationAlerts',
  VERIFICATION_RESULT: 'verificationAlerts',
  RETURN_READY: 'returnAlerts',
  ITEM_RETURNED: 'returnAlerts'
};

/**
 * Types worth an email. REPORT_UPDATE / ORGANIZATION / SYSTEM are in-app only:
 * they are frequent and low-stakes, and mailing each one would train people to
 * ignore the ones that matter. The same five types the product spec names.
 */
const EMAIL_TYPES = new Set([
  'NEW_MATCH',
  'VERIFICATION_REQUIRED',
  'VERIFICATION_RESULT',
  'RETURN_READY',
  'ITEM_RETURNED'
]);

const prefsFor = (user) => ({
  matchAlerts: true,
  verificationAlerts: true,
  returnAlerts: true,
  emailAlerts: true,
  ...(user?.preferences || {})
});

/**
 * Creates one notification unless the recipient muted that category.
 * Returns the created notification, or null when suppressed.
 */
async function notify(userId, organizationId, { type, title, message, referenceId, referenceType, meta }) {
  if (!userId) return null;
  const store = getDriver();

  const user = await store.findUserById(userId);
  const prefKey = PREFERENCE_FOR[type];
  if (user && prefKey && prefsFor(user)[prefKey] === false) return null;

  const notification = await store.createNotification({
    organizationId,
    userId,
    type,
    title,
    message,
    referenceId: referenceId ? String(referenceId) : null,
    referenceType: referenceType || '',
    meta: meta || {},
    read: false
  });

  try {
    realtime.publish(organizationId, {
      type,
      userId,
      payload: {
        id: notification.id,
        type,
        title,
        message,
        referenceId: notification.referenceId,
        referenceType: notification.referenceType
      }
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notificationService] realtime publish failed:', err.message);
  }

  // Email is a second channel, not a second step: never awaited, never able to
  // fail the notification that has already been written and pushed.
  deliverEmail(notification, user);

  return notification;
}

/**
 * Sends the email half of a notification.
 *
 * Deliberately fire-and-forget and outside the request path: SMTP is slow and
 * occasionally dead, and neither may delay a match alert. The user preference
 * `emailAlerts` gates it, and the outcome is only ever logged — a failed email
 * must not fail the action that produced it (the in-app row already exists).
 */
function deliverEmail(notification, user) {
  if (!notification || !EMAIL_TYPES.has(notification.type)) return Promise.resolve(null);
  if (!user || !user.email) return Promise.resolve(null);
  if (prefsFor(user).emailAlerts === false) return Promise.resolve(null);

  const body = `${notification.title}\n\n${notification.message}\n\n— LostLink AI`;
  // The reference id is included so a reply/quarrel can be traced to the row,
  // but no token, QR secret or otp is ever put in an email.
  const ref = notification.referenceId ? `\nReference: ${notification.referenceType || 'REPORT'} ${notification.referenceId}` : '';

  return mail
    .send({
      to: user.email,
      subject: `[LostLink AI] ${notification.title}`,
      text: `${body}${ref}`,
      meta: { notificationId: notification.id, type: notification.type }
    })
    .catch(() => null); // send() already never rejects; belt and braces.
}

/** Bulk variant used when an action affects several members. */
async function notifyMany(userIds, organizationId, payload) {
  const created = [];
  for (const userId of userIds) {
    // eslint-disable-next-line no-await-in-loop
    const n = await notify(userId, organizationId, payload);
    if (n) created.push(n);
  }
  return created;
}

const listForUser = async (req, { read, type, limit, offset } = {}) => {
  const orgId = req.user.activeOrgId;
  if (!orgId) throw AppError.badRequest('No active organization');

  const filters = { limit, offset };
  if (read !== undefined) filters.read = read;
  if (type) filters.type = type;

  const { notifications, total } = await getDriver().listNotifications(req.user.id, orgId, filters);
  const counts = await getDriver().countNotificationsByType(req.user.id, orgId);
  const unread = await getDriver().countUnreadNotifications(req.user.id, orgId);

  return { notifications, total, limit, offset, counts, unread };
};

const markRead = async (req, id) => {
  const notification = await getDriver().markNotificationRead(id, req.user.id);
  if (!notification) throw AppError.notFound('Notification not found');
  if (req.user.activeOrgId && notification.organizationId !== req.user.activeOrgId) {
    throw AppError.notFound('Notification not found');
  }
  return notification;
};

const markAllRead = async (req) => {
  const orgId = req.user.activeOrgId;
  if (!orgId) throw AppError.badRequest('No active organization');
  const updated = await getDriver().markAllNotificationsRead(req.user.id, orgId);
  return { updated };
};

const unreadCount = (req) => {
  const orgId = req.user.activeOrgId;
  if (!orgId) return Promise.resolve(0);
  return getDriver().countUnreadNotifications(req.user.id, orgId);
};

module.exports = {
  TYPE,
  EMAIL_TYPES,
  notify,
  notifyMany,
  listForUser,
  markRead,
  markAllRead,
  unreadCount,
  deliverEmail
};
