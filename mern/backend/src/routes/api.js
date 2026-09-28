/**
 * Core API routes. Every route is authenticated; mutating routes additionally
 * enforce organization membership + role permissions inside the services.
 */
const express = require('express');
const { protect, roleRequired, apiLimiter } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { uploadImage } = require('../middleware/upload');
const s = require('../middleware/schemas');

const reports = require('../controllers/reportsController');
const matches = require('../controllers/matchesController');
const verification = require('../controllers/verificationController');
const notifications = require('../controllers/notificationsController');
const returns = require('../controllers/returnsController');
const analytics = require('../controllers/analyticsController');
const audit = require('../controllers/auditController');
const dashboard = require('../controllers/dashboardController');
const ai = require('../controllers/aiController');
const custody = require('../controllers/custodyController');
const cctv = require('../controllers/cctvController');
const health = require('../controllers/healthController');

const router = express.Router();
const STAFF = roleRequired('staff', 'security', 'admin', 'owner');
const MANAGERS = roleRequired('admin', 'owner');

/* ---- health / dashboard / profile / search ---- */
// Real ops surface (store / queue / AI / mail / storage), not a literal "ok".
// `?refresh=1` bypasses the short AI-health cache. No auth: it is the probe.
router.get('/health', health.health);
router.get('/health/live', health.live);
// `?verify=1` runs a real micro-inference per model (slow, opt-in).
router.get('/health/models', health.models);
router.get('/dashboard', protect, validate(s.dashboardQuery, 'query'), dashboard.getUserDashboard);
router.get('/dashboard/unread', protect, dashboard.getUnread);
router.get('/directory', protect, dashboard.getDirectory);
router.get('/profile', protect, dashboard.getProfile);
router.patch('/profile', protect, validate(s.updateProfileSchema), dashboard.updateProfile);
// A photo the user picked for themselves. Same storage engine as report photos,
// so the magic-byte check and the /uploads mount apply unchanged.
router.post('/profile/avatar', protect, apiLimiter, uploadImage, dashboard.uploadAvatar);
router.post('/profile/password', protect, validate(s.changePasswordSchema), dashboard.changePassword);
router.get('/search', protect, validate(s.searchQuery, 'query'), dashboard.search);

/* ---- AI ---- */
router.get('/ai/provider', protect, ai.provider);
router.post('/ai/analyze-item', protect, apiLimiter, uploadImage, ai.analyzeItem);

/* ---- reports ---- */
router.post('/reports/lost', protect, validate(s.lostReportSchema), reports.createLostReport);
router.post('/reports/found', protect, validate(s.foundReportSchema), reports.createFoundReport);
router.get('/reports', protect, validate(s.listReportsQuery, 'query'), reports.listReports);
router.get('/reports/:id', protect, reports.getReportById);
router.get('/reports/:id/timeline', protect, reports.getReportTimeline);
router.patch('/reports/:id', protect, validate(s.updateReportSchema), reports.updateReport);
// A photo the user took of their own item. `uploadImage` only stores the bytes;
// the service decides whether this caller may attach them to THIS report and
// removes the file again when they may not.
router.post('/reports/:id/image', protect, apiLimiter, uploadImage, reports.addReportImage);
router.delete('/reports/:id/image', protect, validate(s.removeReportImageSchema), reports.removeReportImage);
router.delete('/reports/:id', protect, reports.deleteReport);
router.post('/reports/:id/rematch', protect, reports.rematch);
router.get('/reports/:id/custody', protect, custody.getReportCustody);
// Re-hashes the whole chain and reports the first row that does not verify.
router.get('/reports/:id/custody/verify', protect, custody.verifyCustodyChain);
router.post('/reports/:id/custody', protect, STAFF, validate(s.addCustodyRecordSchema), custody.addCustodyRecord);

/* ---- matches ---- */
router.get('/matches', protect, validate(s.listMatchesQuery, 'query'), matches.listMatches);
router.get('/matches/:id', protect, matches.getMatchById);
router.post('/matches/:id/review', protect, STAFF, validate(s.reviewMatchSchema), matches.reviewMatch);

/* ---- verification ---- */
router.post('/verifications', protect, validate(s.startVerificationSchema), verification.createVerification);
router.get('/verifications', protect, validate(s.listVerificationsQuery, 'query'), verification.listVerifications);
router.post('/verifications/:id/answer', protect, validate(s.answerVerificationSchema), verification.submitVerificationAnswer);
router.post('/verifications/:id/review', protect, STAFF, validate(s.reviewVerificationSchema), verification.reviewVerification);

/* ---- notifications ---- */
router.get('/notifications', protect, validate(s.listNotificationsQuery, 'query'), notifications.listNotifications);
router.get('/notifications/summary', protect, notifications.getNotificationSummary);
router.patch('/notifications/read-all', protect, notifications.markAllNotificationsRead);
router.patch('/notifications/:id/read', protect, notifications.markNotificationRead);

/* ---- returns / QR ---- */
router.get('/returns', protect, returns.listReturns);
router.post('/returns/:reportId/create', protect, STAFF, validate(s.authorizeReturnSchema), returns.createReturnAuthorization);
router.get('/returns/:id', protect, returns.getReturnById);
router.get('/returns/:id/qr', protect, returns.getReturnById);
router.post('/returns/:id/refresh-qr', protect, returns.refreshQr);
// Rate-limited like tagd's scan endpoint: a scan happens at a physical
// handover, so a burst of failed attempts against one code is a signal
// (someone guessing), not a typo storm.
router.post('/returns/:id/scan-qr', protect, STAFF, apiLimiter, validate(s.scanQrSchema), returns.scanQrCode);

/* ---- chain of custody ---- */
router.get('/custody', protect, validate(s.listCustodyQuery, 'query'), custody.listCustody);
router.get('/custody/:id', protect, custody.getCustodyRecord);

/* ---- CCTV / last-seen analysis ---- */
router.get('/cctv/status', protect, cctv.status);
router.get('/cctv/events/:reportId', protect, cctv.listEvents);
router.post('/cctv/analyze', protect, STAFF, apiLimiter, validate(s.cctvAnalyzeSchema), cctv.analyze);

/* ---- analytics ---- */
router.get('/analytics/organization', protect, MANAGERS, validate(s.analyticsQuery, 'query'), analytics.getOrganizationAnalytics);
// CSV of the same rows, for an admin who needs to keep or forward the numbers.
// Declared before the parameterised path so `/export` is never read as a period.
router.get('/analytics/organization/export', protect, MANAGERS, validate(s.analyticsQuery, 'query'), analytics.exportOrganizationAnalytics);
router.get('/analytics/user', protect, validate(s.analyticsQuery, 'query'), analytics.getUserAnalytics);

/* ---- audit ---- */
router.get('/audit-logs', protect, MANAGERS, validate(s.auditQuery, 'query'), audit.listAuditLogs);
router.get('/audit-logs/export', protect, MANAGERS, validate(s.auditQuery, 'query'), audit.exportAuditLogs);
router.get('/audit-log-types', protect, MANAGERS, audit.listActionTypes);

/* ---- organization settings & members (mounted here for the SPA client) ---- */
const orgSettings = require('../controllers/orgSettingsController');
router.get('/organizations/:id/settings', protect, orgSettings.getOrganizationSettings);
router.patch('/organizations/:id/settings', protect, MANAGERS, validate(s.orgSettingsSchema), orgSettings.updateOrganizationSettings);
router.get('/organizations/:id/users', protect, MANAGERS, orgSettings.listOrganizationUsers);
router.patch('/organizations/:id/users/:userId', protect, MANAGERS, validate(s.updateRoleSchema), orgSettings.updateUserRole);
router.post('/organizations/:id/invite', protect, MANAGERS, validate(s.inviteSchema), orgSettings.inviteUser);

/* ---- realtime events (SSE) ---- */
const realtime = require('../realtime/events');
router.get('/events', protect, realtime.sseHandler);

module.exports = router;
