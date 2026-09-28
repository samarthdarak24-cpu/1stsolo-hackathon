/**
 * MongoDB driver — implements the store interface with mongoose models.
 * Selected automatically when MONGO_URI is reachable and DATA_MODE !== "memory".
 *
 * The memory driver mirrors this exact interface; controllers/services only ever
 * see these methods, never mongoose directly.
 */
const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { activitySeries } = require('./activitySeries');

const {
  User, Organization, Report, Match, Verification, Notification, ReturnCase, CustodyRecord, AuditLog,
  toUser, toOrg, toReport, toMatch, toVerification, toNotification, toReturn, toCustodyRecord, toAuditLog
} = require('../models');

const REPORT_REFERENCE = 'LL-';

async function generateReference() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const ref = REPORT_REFERENCE + crypto.randomBytes(3).toString('hex').toUpperCase();
    // eslint-disable-next-line no-await-in-loop
    const exists = await Report.findOne({ reference: ref }).lean();
    if (!exists) return ref;
  }
  return REPORT_REFERENCE + String(Date.now()).slice(-6).toUpperCase();
}

const periodStart = (period) => {
  const days = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[period] || 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
};

const inRange = (date, from) => new Date(date || 0) >= from;

module.exports = {
  mode: 'mongo',

  // ---- Users ----
  async createUser({ name, email, password }) {
    const passwordHash = await bcrypt.hash(password, 10);
    const u = await User.create({ name, email: String(email).toLowerCase(), passwordHash });
    return toUser(u);
  },

  async findUserByEmail(email) {
    return toUser(await User.findOne({ email: String(email).toLowerCase() }));
  },

  async findUserById(id) {
    if (!mongoose.isValidObjectId(id)) return null;
    return toUser(await User.findById(id));
  },

  async listUsers() {
    return (await User.find().limit(500)).map(toUser);
  },

  async findUserByResetToken(token) {
    if (!token) return null;
    const u = await User.findOne({ resetToken: token });
    if (!u || !u.resetTokenExpiry || u.resetTokenExpiry < new Date()) return null;
    return toUser(u);
  },

  async updateUser(id, patch) {
    if (!mongoose.isValidObjectId(id)) return null;
    return toUser(await User.findByIdAndUpdate(id, patch, { new: true }));
  },

  async addMembership(userId, orgId, role, { activate = true } = {}) {
    const u = await User.findById(userId);
    if (!u) return null;
    const existing = u.memberships.find(m => m.orgId === String(orgId));
    if (existing) {
      existing.role = role;
    } else {
      u.memberships.push({ orgId: String(orgId), role, joinedAt: new Date() });
    }
    if (activate || !u.activeOrgId) u.activeOrgId = String(orgId);
    await u.save();
    return toUser(u);
  },

  async setMembershipRole(userId, orgId, role) {
    const u = await User.findById(userId);
    if (!u) return null;
    const m = u.memberships.find(x => x.orgId === String(orgId));
    if (!m) return null;
    m.role = role;
    await u.save();
    return toUser(u);
  },

  async removeMembership(userId, orgId) {
    const u = await User.findById(userId);
    if (!u) return null;
    u.memberships = u.memberships.filter(m => m.orgId !== String(orgId));
    if (u.activeOrgId === String(orgId)) u.activeOrgId = u.memberships[0]?.orgId || null;
    await u.save();
    return toUser(u);
  },

  async getUserMemberships(userId) {
    const u = await User.findById(userId);
    if (!u) return [];
    return u.memberships.map(m => ({ orgId: m.orgId, role: m.role, joinedAt: m.joinedAt }));
  },

  // ---- Organizations ----
  async createOrg({ name, type, emailDomain, emailDomains, location, logoUrl, ownerId, inviteCode, settings }) {
    const domains = (emailDomains && emailDomains.length ? emailDomains : [emailDomain])
      .filter(Boolean)
      .map(d => String(d).toLowerCase().replace(/^@/, ''));
    const o = await Organization.create({
      name,
      type,
      emailDomains: domains,
      location: location || '',
      logoUrl: logoUrl || '',
      inviteCode: inviteCode || crypto.randomBytes(3).toString('hex').toUpperCase(),
      ownerId: ownerId || null,
      settings: settings || {}
    });
    return toOrg(o);
  },

  async findOrgByDomain(domain) {
    const d = String(domain).toLowerCase().replace(/^@/, '');
    return toOrg(await Organization.findOne({ emailDomains: d }));
  },

  async findOrgByInviteCode(code) {
    return toOrg(await Organization.findOne({ inviteCode: String(code).trim().toUpperCase() }));
  },

  async findOrgById(id) {
    if (!mongoose.isValidObjectId(id)) return null;
    return toOrg(await Organization.findById(id));
  },

  async listOrgs() {
    return (await Organization.find().limit(100)).map(toOrg);
  },

  async listMembers(orgId) {
    const users = await User.find({ 'memberships.orgId': String(orgId) });
    return users.map(u => {
      const m = u.memberships.find(x => x.orgId === String(orgId));
      return {
        id: String(u._id),
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl || '',
        role: m.role,
        joinedAt: m.joinedAt,
        isVerified: u.isVerified,
        active: u.activeOrgId === String(orgId)
      };
    });
  },

  async updateOrg(id, patch) {
    if (!mongoose.isValidObjectId(id)) return null;
    return toOrg(await Organization.findByIdAndUpdate(id, patch, { new: true }));
  },

  async countUsers() {
    return User.countDocuments();
  },

  // ---- Reports ----
  async createReport(report) {
    const { reference, ...rest } = report;
    const r = await Report.create({ ...rest, reference: reference || (await generateReference()) });
    return toReport(r);
  },

  async findReportById(id) {
    if (!mongoose.isValidObjectId(id)) return null;
    return toReport(await Report.findById(id));
  },

  async findReportByReference(reference) {
    return toReport(await Report.findOne({ reference }));
  },

  async listReports(orgId, filters = {}) {
    const query = { organizationId: String(orgId) };
    if (filters.type) query.type = filters.type;
    if (filters.status) query.status = filters.status;
    if (filters.category) query.category = new RegExp(filters.category, 'i');
    if (filters.userId) query.userId = String(filters.userId);
    if (filters.excludeUserId) query.userId = { $ne: String(filters.excludeUserId) };
    if (filters.from || filters.to) {
      query.createdAt = {};
      if (filters.from) query.createdAt.$gte = new Date(filters.from);
      if (filters.to) query.createdAt.$lte = new Date(filters.to);
    }
    if (filters.search) {
      const rx = new RegExp(String(filters.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { description: rx },
        { category: rx },
        { location: rx },
        { reference: rx },
        { 'itemProfile.itemName': rx },
        { 'itemProfile.brand': rx },
        { 'itemProfile.primaryColor': rx }
      ];
    }

    const limit = Math.min(Number(filters.limit) || 200, 500);
    const offset = Number(filters.offset) || 0;
    // `_id` is a tiebreaker, not decoration: seeded reports share a createdAt and
    // an unstable sort would duplicate (or skip) rows across pages, which the CSV
    // export and any pager walk straight into.
    const [rows, total] = await Promise.all([
      Report.find(query).sort({ createdAt: -1, _id: -1 }).skip(offset).limit(limit),
      Report.countDocuments(query)
    ]);
    return { reports: rows.map(toReport), total };
  },

  async updateReport(id, patch) {
    if (!mongoose.isValidObjectId(id)) return null;
    return toReport(await Report.findByIdAndUpdate(id, patch, { new: true }));
  },

  /**
   * Rewind a report's createdAt/updatedAt to a past instant.
   *
   * Two Mongoose behaviours have to be worked around here:
   *  1. `timestamps: true` stamps createdAt at insert time, so demo/seed data
   *     describing "lost 6 days ago" would otherwise be filed under today,
   *     collapsing every 7/30/90-day filter and the volume chart onto one bar.
   *  2. Mongoose 8 marks the `createdAt` path `immutable: true`, so even with
   *     `timestamps: false` a model-level update is silently dropped.
   * Hence the raw collection driver, which bypasses both.
   */
  async backdateReport(id, at) {
    if (!mongoose.isValidObjectId(id) || !at) return null;
    const when = new Date(at);
    await Report.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(String(id)) },
      { $set: { createdAt: when, updatedAt: when } }
    );
    return toReport(await Report.findById(id));
  },

  async deleteReport(id) {
    if (!mongoose.isValidObjectId(id)) return false;
    return !!(await Report.findByIdAndDelete(id));
  },

  async countReportsByStatus(orgId, userId) {
    const query = { organizationId: String(orgId) };
    if (userId) query.userId = String(userId);
    const rows = await Report.aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    return rows.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});
  },

  // ---- Matches ----
  async createMatch(match) {
    const m = await Match.create(match);
    return toMatch(m);
  },

  async findMatchById(id) {
    if (!mongoose.isValidObjectId(id)) return null;
    return toMatch(await Match.findById(id));
  },

  async findMatchByReportPair(lostReportId, foundReportId) {
    return toMatch(await Match.findOne({ lostReportId, foundReportId }));
  },

  async listMatches(orgId, filters = {}) {
    const query = { organizationId: String(orgId) };
    if (filters.status) {
      if (Array.isArray(filters.status)) query.status = { $in: filters.status };
      else query.status = filters.status;
    }
    if (filters.minScore) query.finalScore = { $gte: Number(filters.minScore) };
    if (filters.maxScore) query.finalScore = { ...query.finalScore, $lte: Number(filters.maxScore) };
    if (filters.reportId) query.$or = [{ lostReportId: filters.reportId }, { foundReportId: filters.reportId }];

    const limit = Math.min(Number(filters.limit) || 200, 500);
    const offset = Number(filters.offset) || 0;
    const [rows, total] = await Promise.all([
      Match.find(query).sort({ finalScore: -1, createdAt: -1 }).skip(offset).limit(limit),
      Match.countDocuments(query)
    ]);
    return { matches: rows.map(toMatch), total };
  },

  async updateMatch(id, patch) {
    if (!mongoose.isValidObjectId(id)) return null;
    return toMatch(await Match.findByIdAndUpdate(id, patch, { new: true }));
  },

  async listMatchesForReports(reportIds) {
    if (!reportIds.length) return [];
    return (await Match.find({
      $or: [{ lostReportId: { $in: reportIds } }, { foundReportId: { $in: reportIds } }]
    })).map(toMatch);
  },

  // ---- Verifications ----
  async createVerification(verification) {
    const v = await Verification.create(verification);
    return toVerification(v);
  },

  async findVerificationById(id) {
    if (!mongoose.isValidObjectId(id)) return null;
    return toVerification(await Verification.findById(id));
  },

  async listVerifications(orgId, filters = {}) {
    const query = { organizationId: String(orgId) };
    if (filters.status) query.status = filters.status;
    if (filters.matchId) query.matchId = filters.matchId;
    if (filters.claimantUserId) query.claimantUserId = String(filters.claimantUserId);
    if (filters.reportId) query.reportId = filters.reportId;

    const verifications = await Verification.find(query).sort({ createdAt: -1 }).limit(200);
    return verifications.map(toVerification);
  },

  async updateVerification(id, patch) {
    if (!mongoose.isValidObjectId(id)) return null;
    return toVerification(await Verification.findByIdAndUpdate(id, patch, { new: true }));
  },

  // ---- Notifications ----
  async createNotification(notification) {
    const n = await Notification.create(notification);
    return toNotification(n);
  },

  async createNotifications(list) {
    if (!list.length) return [];
    return (await Notification.insertMany(list)).map(toNotification);
  },

  async listNotifications(userId, orgId, filters = {}) {
    const query = { userId: String(userId), organizationId: String(orgId) };
    if (filters.read !== undefined) query.read = filters.read;
    if (filters.type) {
      if (Array.isArray(filters.type)) query.type = { $in: filters.type };
      else query.type = filters.type;
    }

    const limit = Math.min(Number(filters.limit) || 100, 300);
    const offset = Number(filters.offset) || 0;
    const [rows, total] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit),
      Notification.countDocuments(query)
    ]);
    return { notifications: rows.map(toNotification), total };
  },

  async markNotificationRead(id, userId) {
    if (!mongoose.isValidObjectId(id)) return null;
    return toNotification(await Notification.findOneAndUpdate(
      { _id: id, userId: String(userId) },
      { read: true },
      { new: true }
    ));
  },

  async markAllNotificationsRead(userId, orgId) {
    const res = await Notification.updateMany(
      { userId: String(userId), organizationId: String(orgId), read: false },
      { read: true }
    );
    return res.modifiedCount || 0;
  },

  async countUnreadNotifications(userId, orgId) {
    return Notification.countDocuments({ userId: String(userId), organizationId: String(orgId), read: false });
  },

  async countNotificationsByType(userId, orgId) {
    const rows = await Notification.aggregate([
      { $match: { userId: String(userId), organizationId: String(orgId) } },
      { $group: { _id: { type: '$type', read: '$read' }, count: { $sum: 1 } } }
    ]);
    return rows.reduce((acc, r) => {
      const key = r._id.type;
      acc[key] = (acc[key] || 0) + r.count;
      if (!r._id.read) acc[`${key}:unread`] = (acc[`${key}:unread`] || 0) + r.count;
      acc.total = (acc.total || 0) + r.count;
      if (!r._id.read) acc.unread = (acc.unread || 0) + r.count;
      return acc;
    }, {});
  },

  // ---- Returns ----
  async createReturn(returnObj) {
    const r = await ReturnCase.create(returnObj);
    return toReturn(r);
  },

  async findReturnById(id) {
    if (!mongoose.isValidObjectId(id)) return null;
    return toReturn(await ReturnCase.findById(id));
  },

  async findReturnByReportId(reportId) {
    return toReturn(await ReturnCase.findOne({ reportId: String(reportId) }));
  },

  async findReturnByQrToken(token) {
    if (!token) return null;
    return toReturn(await ReturnCase.findOne({ qrToken: String(token) }));
  },

  async listReturns(orgId, filters = {}) {
    const query = { organizationId: String(orgId) };
    if (filters.reportId) query.reportId = filters.reportId;
    if (filters.status) query.status = filters.status;
    if (filters.verifiedUserId) query.verifiedUserId = String(filters.verifiedUserId);

    const returns = await ReturnCase.find(query).sort({ createdAt: -1 }).limit(200);
    return returns.map(toReturn);
  },

  async updateReturn(id, patch) {
    if (!mongoose.isValidObjectId(id)) return null;
    return toReturn(await ReturnCase.findByIdAndUpdate(id, patch, { new: true }));
  },

  // ---- Custody records (chain of custody) ----
  async createCustodyRecord(record) {
    const c = await CustodyRecord.create(record);
    return toCustodyRecord(c);
  },

  async findCustodyRecordById(id) {
    if (!mongoose.isValidObjectId(id)) return null;
    return toCustodyRecord(await CustodyRecord.findById(id));
  },

  async listCustodyRecords(orgId, filters = {}) {
    const query = { organizationId: String(orgId) };
    if (filters.reportId) query.reportId = String(filters.reportId);
    if (filters.event) query.event = filters.event;
    if (filters.from || filters.to) {
      query.occurredAt = {};
      if (filters.from) query.occurredAt.$gte = new Date(filters.from);
      if (filters.to) query.occurredAt.$lte = new Date(filters.to);
    }

    const limit = Math.min(Number(filters.limit) || 200, 500);
    const offset = Number(filters.offset) || 0;
    const [rows, total] = await Promise.all([
      CustodyRecord.find(query).sort({ occurredAt: -1 }).skip(offset).limit(limit),
      CustodyRecord.countDocuments(query)
    ]);
    return { records: rows.map(toCustodyRecord), total };
  },

  /** Oldest first — a chain of custody reads forwards. */
  async listCustodyRecordsForReport(reportId) {
    const rows = await CustodyRecord.find({ reportId: String(reportId) }).sort({ occurredAt: 1 });
    return rows.map(toCustodyRecord);
  },

  // ---- Audit Logs ----
  async createAuditLog(log) {
    const l = await AuditLog.create(log);
    return toAuditLog(l);
  },

  async listAuditLogs(orgId, filters = {}) {
    const query = { organizationId: String(orgId) };
    if (filters.userId) query.userId = filters.userId;
    if (filters.action) query.action = filters.action;
    if (filters.entityType) query.entityType = filters.entityType;
    if (filters.entityId) query.entityId = filters.entityId;
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }

    const limit = Math.min(Number(filters.limit) || 200, 500);
    const offset = Number(filters.offset) || 0;
    // Newest first with `_id` as a stable tiebreaker. One request commonly writes
    // two audit rows with the same timestamp; without the tiebreaker a pager (and
    // the CSV export, which walks the same list) could repeat or drop one.
    const [rows, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1, _id: -1 }).skip(offset).limit(limit),
      AuditLog.countDocuments(query)
    ]);
    return { logs: rows.map(toAuditLog), total };
  },

  async listActionTypes(orgId) {
    return AuditLog.distinct('action', { organizationId: String(orgId) });
  },

  // ---- Analytics ----
  async getOrgStats(orgId, period = '30d') {
    const from = periodStart(period);
    const [reports, matches, returns, users, verifications] = await Promise.all([
      Report.find({ organizationId: String(orgId) }).lean(),
      Match.find({ organizationId: String(orgId) }).lean(),
      ReturnCase.find({ organizationId: String(orgId) }).lean(),
      User.find({ 'memberships.orgId': String(orgId) }).lean(),
      Verification.find({ organizationId: String(orgId) }).lean()
    ]);

    const lost = reports.filter(r => r.type === 'LOST');
    const found = reports.filter(r => r.type === 'FOUND');
    const completedReturns = returns.filter(r => r.status === 'COMPLETED');

    const byCategory = reports.reduce((acc, r) => {
      const key = r.category || 'Uncategorised';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const byStatus = reports.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    const weeklyActivity = this.activitySeries(reports.map(r => r.createdAt), period);
    const resolved = reports.filter(r => r.status === 'RETURNED').length;

    return {
      totalReports: reports.length,
      lostReports: lost.length,
      foundReports: found.length,
      matches: matches.length,
      highConfidenceMatches: matches.filter(m => m.finalScore >= 85).length,
      verifiedReturns: completedReturns.length,
      pendingVerifications: verifications.filter(v => v.status === 'PENDING').length,
      unresolvedItems: reports.filter(r => !['RETURNED', 'CLOSED'].includes(r.status)).length,
      members: users.length,
      matchRate: reports.length ? Math.round((matches.length / reports.length) * 100) : 0,
      returnRate: matches.length ? Math.round((completedReturns.length / matches.length) * 100) : 0,
      resolutionRate: reports.length ? Math.round((resolved / reports.length) * 100) : 0,
      thisPeriodReports: reports.filter(r => inRange(r.createdAt, from)).length,
      previousPeriodReports: reports.filter(r => {
        const t = new Date(r.createdAt).getTime();
        return t >= from.getTime() - (Date.now() - from.getTime()) && t < from.getTime();
      }).length,
      byCategory,
      byStatus,
      weeklyActivity,
      recentMatches: matches
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .map(toMatch)
    };
  },

  async getUserStats(userId, orgId, period = '30d') {
    const from = periodStart(period);
    const reports = await Report.find({ userId: String(userId), organizationId: String(orgId) }).lean();
    const reportIds = reports.map(r => String(r._id));
    const matches = reportIds.length
      ? await Match.find({
        organizationId: String(orgId),
        $or: [{ lostReportId: { $in: reportIds } }, { foundReportId: { $in: reportIds } }]
      }).lean()
      : [];
    const notifications = await Notification.find({ userId: String(userId), organizationId: String(orgId) }).lean();
    const returns = await ReturnCase.find({ organizationId: String(orgId), verifiedUserId: String(userId) }).lean();

    const lost = reports.filter(r => r.type === 'LOST');
    const found = reports.filter(r => r.type === 'FOUND');
    const windowMs = Date.now() - from.getTime();
    const previousWindowStart = new Date(from.getTime() - windowMs);
    const thisPeriod = reports.filter(r => inRange(r.createdAt, from)).length;
    const prevPeriod = reports.filter(r => {
      const t = new Date(r.createdAt).getTime();
      return t >= previousWindowStart.getTime() && t < from.getTime();
    }).length;

    const byCategory = reports.reduce((acc, r) => {
      const key = r.category || 'Uncategorised';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      totalReports: reports.length,
      lostReports: lost.length,
      foundReports: found.length,
      activeLostReports: lost.filter(r => !['RETURNED', 'CLOSED'].includes(r.status)).length,
      activeMatches: matches.filter(m => ['PENDING_VERIFICATION', 'MANUAL_REVIEW', 'PENDING'].includes(m.status)).length,
      totalMatches: matches.length,
      returnedItems: reports.filter(r => r.status === 'RETURNED').length + returns.filter(r => r.status === 'COMPLETED').length,
      matchRate: lost.length ? Math.round((matches.length / lost.length) * 100) : 0,
      notifications: notifications.length,
      unreadNotifications: notifications.filter(n => !n.read).length,
      thisPeriodReports: thisPeriod,
      previousPeriodReports: prevPeriod,
      byCategory,
      byStatus: reports.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {}),
      weeklyActivity: this.activitySeries(reports.map(r => r.createdAt), period)
    };
  },

  /** Builds a normalised { label, value } series so charts never receive raw dates. */
  activitySeries(dates, period = '30d') {
    return activitySeries(dates, period);
  },

  /** Org-scoped global search across reports and matches. */
  async search(orgId, term, { limit = 8, userId } = {}) {
    const rx = new RegExp(String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const reportQuery = {
      organizationId: String(orgId),
      $or: [
        { description: rx }, { category: rx }, { location: rx }, { reference: rx },
        { 'itemProfile.itemName': rx }, { 'itemProfile.brand': rx }, { 'itemProfile.primaryColor': rx },
        { 'itemProfile.visibleMark': rx }
      ]
    };
    if (userId) reportQuery.userId = String(userId);

    const [lost, found, matches] = await Promise.all([
      Report.find({ ...reportQuery, type: 'LOST' }).sort({ createdAt: -1 }).limit(limit).lean(),
      Report.find({ ...reportQuery, type: 'FOUND' }).sort({ createdAt: -1 }).limit(limit).lean(),
      Match.find({ organizationId: String(orgId), finalScore: { $gte: 40 } }).sort({ finalScore: -1 }).limit(limit).lean()
    ]);

    const matchResults = [];
    for (const m of matches) {
      const [l, f] = await Promise.all([
        Report.findById(m.lostReportId).lean(),
        Report.findById(m.foundReportId).lean()
      ]);
      const haystack = [l?.itemProfile?.itemName, l?.category, l?.description, l?.location, f?.location]
        .filter(Boolean).join(' ');
      if (rx.test(haystack)) {
        matchResults.push({ match: toMatch(m), lost: toReport(l), found: toReport(f) });
      }
    }

    return {
      lostReports: lost.map(r => ({ ...toReport(r), _id: undefined })),
      foundReports: found.map(r => ({ ...toReport(r), _id: undefined })),
      matches: matchResults
    };
  }
};
