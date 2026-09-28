const { asyncHandler } = require('../utils/errors');
const notificationService = require('../services/notificationService');
const dashboardService = require('../services/dashboardService');

const listNotifications = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const result = await notificationService.listForUser(req, {
    read: query.read === undefined ? undefined : query.read === 'true',
    type: query.type,
    limit: query.limit,
    offset: query.offset
  });
  res.json(result);
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req, req.params.id);
  res.json({ message: 'Notification marked as read', notification });
});

const markAllNotificationsRead = asyncHandler(async (req, res) => res.json(await notificationService.markAllRead(req)));

/** GET /api/notifications/summary — counts for the summary cards + topbar bell. */
const getNotificationSummary = asyncHandler(async (req, res) => {
  const { counts, unread } = await dashboardService.getUnreadCount(req);
  const sum = (...types) => types.reduce((acc, t) => acc + (counts[t] || 0), 0);
  const sumUnread = (...types) => types.reduce((acc, t) => acc + (counts[`${t}:unread`] || 0), 0);

  res.json({
    unread: unread || 0,
    total: counts.total || 0,
    matches: sum('NEW_MATCH'),
    matchesUnread: sumUnread('NEW_MATCH'),
    verification: sum('VERIFICATION_REQUIRED', 'VERIFICATION_RESULT'),
    verificationUnread: sumUnread('VERIFICATION_REQUIRED', 'VERIFICATION_RESULT'),
    returns: sum('RETURN_READY', 'ITEM_RETURNED'),
    returnsUnread: sumUnread('RETURN_READY', 'ITEM_RETURNED'),
    reports: sum('REPORT_UPDATE'),
    organization: sum('ORGANIZATION'),
    system: sum('SYSTEM')
  });
});

module.exports = { listNotifications, markNotificationRead, markAllNotificationsRead, getNotificationSummary };
