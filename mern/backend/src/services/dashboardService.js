/**
 * Dashboard service — one aggregated payload for the user dashboard home.
 * Every number comes from the database; nothing is fabricated.
 */
const { getDriver } = require('../store');
const { requireActiveOrg } = require('./orgContext');

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

async function getUserDashboard(req, { period = '30d' } = {}) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  const userId = req.user.id;

  const [stats, reportList, matchList, notificationList, returnList, verificationList, org] = await Promise.all([
    store.getUserStats(userId, ctx.orgId, period),
    store.listReports(ctx.orgId, { userId, limit: 6 }),
    store.listMatches(ctx.orgId, { limit: 200 }),
    store.listNotifications(userId, ctx.orgId, { limit: 3 }),
    store.listReturns(ctx.orgId, { verifiedUserId: userId }),
    store.listVerifications(ctx.orgId, { claimantUserId: userId }),
    store.findOrgById(ctx.orgId)
  ]);

  const myReportIds = new Set(reportList.reports.map(r => r.id));
  const allMyReports = await store.listReports(ctx.orgId, { userId, limit: 500 });
  myReportIds.clear();
  allMyReports.reports.forEach(r => myReportIds.add(r.id));

  const myMatches = matchList.matches
    .filter(m => myReportIds.has(m.lostReportId) || myReportIds.has(m.foundReportId))
    .sort((a, b) => b.finalScore - a.finalScore);

  // Enrich the top candidate matches with both sides of the comparison.
  const topMatches = [];
  for (const match of myMatches.slice(0, 4)) {
    // eslint-disable-next-line no-await-in-loop
    const [lost, found] = await Promise.all([
      store.findReportById(match.lostReportId),
      store.findReportById(match.foundReportId)
    ]);
    topMatches.push({
      ...match,
      lost: lost && { id: lost.id, reference: lost.reference, itemProfile: lost.itemProfile, images: lost.images, category: lost.category, location: lost.location, type: lost.type, createdAt: lost.createdAt },
      found: found && { id: found.id, reference: found.reference, itemProfile: found.itemProfile, images: found.images, category: found.category, location: found.location, type: found.type, createdAt: found.createdAt }
    });
  }

  const openReturns = returnList.filter(r => r.status !== 'COMPLETED');
  const recoveredItems = allMyReports.reports.filter(r => r.status === 'RETURNED');

  const membership = (req.user.memberships || []).find(m => m.orgId === ctx.orgId);

  return {
    greeting: {
      name: req.user.name.split(' ')[0],
      dateLabel: new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })
    },
    organization: {
      id: org.id,
      name: org.name,
      type: org.type,
      logoUrl: org.logoUrl,
      location: org.location
    },
    membership: {
      role: ctx.role,
      joinedAt: membership?.joinedAt || org.createdAt
    },
    period,
    stats: {
      activeLostReports: stats.activeLostReports,
      lostReports: stats.lostReports,
      foundReports: stats.foundReports,
      activeMatches: stats.activeMatches,
      totalMatches: stats.totalMatches,
      returnedItems: stats.returnedItems,
      totalReports: stats.totalReports,
      unreadNotifications: stats.unreadNotifications,
      openReturns: openReturns.length,
      pendingVerifications: verificationList.filter(v => v.status === 'PENDING').length
    },
    trends: {
      thisPeriod: stats.thisPeriodReports,
      previousPeriod: stats.previousPeriodReports,
      change: stats.thisPeriodReports - stats.previousPeriodReports,
      changePercent: stats.previousPeriodReports
        ? Math.round(((stats.thisPeriodReports - stats.previousPeriodReports) / stats.previousPeriodReports) * 100)
        : (stats.thisPeriodReports > 0 ? 100 : 0)
    },
    topMatches,
    recentReports: allMyReports.reports.slice(0, 6).map(r => {
      const related = myMatches.filter(m => m.lostReportId === r.id || m.foundReportId === r.id);
      return {
        ...r,
        bestMatch: related.length ? { id: related[0].id, finalScore: related[0].finalScore, status: related[0].status } : null
      };
    }),
    notifications: notificationList.notifications,
    returns: openReturns.slice(0, 3).map(r => ({
      id: r.id,
      reportId: r.reportId,
      status: r.status,
      pickupLocation: r.pickupLocation,
      qrExpiresAt: r.qrExpiresAt
    })),
    charts: {
      activity: stats.weeklyActivity,
      byCategory: Object.entries(stats.byCategory).map(([label, value]) => ({ label, value })),
      byStatus: Object.entries(stats.byStatus).map(([label, value]) => ({ label, value }))
    },
    recovery: {
      total: allMyReports.total,
      reported: allMyReports.reports.filter(r => r.status === 'REPORTED' || r.status === 'MATCHING').length,
      matched: allMyReports.reports.filter(r => ['POTENTIAL_MATCH', 'MATCHED'].includes(r.status)).length,
      verifying: allMyReports.reports.filter(r => r.status === 'VERIFICATION_PENDING').length,
      verified: allMyReports.reports.filter(r => r.status === 'VERIFIED').length,
      ready: allMyReports.reports.filter(r => r.status === 'RETURN_READY').length,
      returned: recoveredItems.length
    },
    empty: {
      hasReports: allMyReports.total > 0,
      hasMatches: myMatches.length > 0,
      hasNotifications: notificationList.total > 0,
      hasReturns: returnList.length > 0
    },
    generatedAt: new Date()
  };
}

/** Small helper used by the topbar bell. */
async function getUnreadCount(req) {
  const store = getDriver();
  if (!req.user.activeOrgId) return { unread: 0 };
  const counts = await store.countNotificationsByType(req.user.id, req.user.activeOrgId);
  return { unread: counts.unread || 0, counts };
}

module.exports = { getUserDashboard, getUnreadCount, daysAgo };
