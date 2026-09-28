/**
 * In-memory driver — implements the exact same interface as mongoDriver.
 * Used automatically when MongoDB is unreachable (demo / hackathon mode).
 * All query semantics here are deliberately kept close to the Mongo versions so
 * controllers and services behave identically in either mode.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const state = () => {
  if (!globalThis.__lostlinkMem) {
    globalThis.__lostlinkMem = {
      users: [], orgs: [], reports: [], matches: [], verifications: [],
      notifications: [], returns: [], custodyRecords: [], auditLogs: [], seq: 1
    };
  }
  return globalThis.__lostlinkMem;
};

const nextId = () => 'mem_' + (state().seq++).toString(36).padStart(8, '0');
const nextNumId = (prefix) => prefix + '-' + String(state().seq++).toString().padStart(4, '0');

const periodStart = (period) => {
  const days = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[period] || 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
};

const matchesTerm = (report, term) => {
  if (!term) return true;
  const t = String(term).toLowerCase();
  const p = report.itemProfile || {};
  return [report.description, report.category, report.location, report.reference, p.itemName, p.brand, p.primaryColor, p.visibleMark]
    .filter(Boolean).join(' ').toLowerCase().includes(t);
};

const { activitySeries } = require('./activitySeries');

/**
 * Pagination helper.
 *
 * `key` names the collection in the response (`reports`, `matches`, `logs`, ...)
 * so the memory driver returns the exact same envelope as mongoDriver. Getting
 * this wrong silently hands `undefined` to the service layer, so the key is
 * explicit and required at every call site.
 */
/**
 * Newest-first comparator with a stable tiebreaker.
 *
 * Mirrors the Mongo driver's `{ createdAt: -1, _id: -1 }`. Rows written by one
 * request share a timestamp, and an unstable sort makes a pager — and the CSV
 * export that walks it — repeat or drop rows.
 */
const byNewest = (a, b) => (new Date(b.createdAt) - new Date(a.createdAt))
  || String(b.id || '').localeCompare(String(a.id || ''));

const paginate = (rows, filters, key) => {
  const limit = Math.min(Number(filters.limit) || 200, 500);
  const offset = Number(filters.offset) || 0;
  return { [key || 'rows']: rows.slice(offset, offset + limit), total: rows.length };
};

const memoryDriver = {
  mode: 'memory',

  // ---- Users ----
  async createUser({ name, email, password, phone, avatarUrl, bio }) {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      id: nextId(), name, email: String(email).toLowerCase(), passwordHash,
      phone: phone || '', avatarUrl: avatarUrl || '', bio: bio || '',
      isVerified: false, createdAt: new Date().toISOString(),
      preferences: {}, sessions: [], resetToken: null, resetTokenExpiry: null,
      memberships: [], activeOrgId: null
    };
    state().users.push(user);
    return { ...user };
  },

  async findUserByEmail(email) {
    const u = state().users.find(x => x.email === String(email).toLowerCase());
    return u ? { ...u, memberships: (u.memberships || []).map(m => ({ ...m })) } : null;
  },

  async findUserById(id) {
    const u = state().users.find(x => x.id === String(id));
    return u ? { ...u, memberships: (u.memberships || []).map(m => ({ ...m })) } : null;
  },

  async listUsers() {
    return state().users.map(u => ({ ...u, memberships: (u.memberships || []).map(m => ({ ...m })) }));
  },

  async findUserByResetToken(token) {
    if (!token) return null;
    const u = state().users.find(x => x.resetToken === token);
    if (!u || !u.resetTokenExpiry || new Date(u.resetTokenExpiry) < new Date()) return null;
    return { ...u, memberships: (u.memberships || []).map(m => ({ ...m })) };
  },

  async updateUser(id, patch) {
    const u = state().users.find(x => x.id === String(id));
    if (!u) return null;
    Object.assign(u, patch);
    return { ...u, memberships: (u.memberships || []).map(m => ({ ...m })) };
  },

  async addMembership(userId, orgId, role, { activate = true } = {}) {
    const u = state().users.find(x => x.id === String(userId));
    if (!u) return null;
    const existing = (u.memberships || []).find(m => m.orgId === String(orgId));
    if (existing) existing.role = role;
    else u.memberships.push({ orgId: String(orgId), role, joinedAt: new Date().toISOString() });
    if (activate || !u.activeOrgId) u.activeOrgId = String(orgId);
    return { ...u, memberships: u.memberships.map(m => ({ ...m })) };
  },

  async setMembershipRole(userId, orgId, role) {
    const u = state().users.find(x => x.id === String(userId));
    if (!u) return null;
    const m = (u.memberships || []).find(x => x.orgId === String(orgId));
    if (!m) return null;
    m.role = role;
    return { ...u, memberships: u.memberships.map(x => ({ ...x })) };
  },

  async removeMembership(userId, orgId) {
    const u = state().users.find(x => x.id === String(userId));
    if (!u) return null;
    u.memberships = (u.memberships || []).filter(m => m.orgId !== String(orgId));
    if (u.activeOrgId === String(orgId)) u.activeOrgId = u.memberships[0]?.orgId || null;
    return { ...u, memberships: u.memberships.map(m => ({ ...m })) };
  },

  async getUserMemberships(userId) {
    const u = state().users.find(x => x.id === String(userId));
    if (!u) return [];
    return (u.memberships || []).map(m => ({ ...m }));
  },

  // ---- Organizations ----
  async createOrg({ name, type, emailDomain, emailDomains, location, logoUrl, ownerId, inviteCode, settings }) {
    const domains = (emailDomains && emailDomains.length ? emailDomains : [emailDomain])
      .filter(Boolean).map(d => String(d).toLowerCase().replace(/^@/, ''));
    const org = {
      id: nextId(), name, type,
      emailDomain: domains[0] || '', emailDomains: domains, verifiedDomains: [],
      location: location || '', logoUrl: logoUrl || '',
      inviteCode: inviteCode || nextNumId('ORG').slice(-8),
      ownerId: ownerId || null, verificationStatus: 'pending',
      settings: settings || {}, createdAt: new Date().toISOString()
    };
    state().orgs.push(org);
    return { ...org };
  },

  async findOrgByDomain(domain) {
    const d = String(domain).toLowerCase().replace(/^@/, '');
    const o = state().orgs.find(x => (x.emailDomains || [x.emailDomain]).includes(d));
    return o ? { ...o } : null;
  },

  async findOrgByInviteCode(code) {
    const o = state().orgs.find(x => x.inviteCode === String(code).trim().toUpperCase());
    return o ? { ...o } : null;
  },

  async findOrgById(id) {
    const o = state().orgs.find(x => x.id === String(id));
    return o ? { ...o } : null;
  },

  async listOrgs() { return state().orgs.map(o => ({ ...o })); },

  async listMembers(orgId) {
    return state().users
      .filter(u => (u.memberships || []).some(m => m.orgId === String(orgId)))
      .map(u => {
        const m = u.memberships.find(x => x.orgId === String(orgId));
        return {
          id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl || '',
          role: m.role, joinedAt: m.joinedAt, isVerified: u.isVerified,
          active: u.activeOrgId === String(orgId)
        };
      });
  },

  async countUsers() { return state().users.length; },

  async updateOrg(id, patch) {
    const o = state().orgs.find(x => x.id === String(id));
    if (!o) return null;
    Object.assign(o, patch);
    if (patch.emailDomains && patch.emailDomains.length) o.emailDomain = patch.emailDomains[0];
    return { ...o };
  },

  // ---- Reports ----
  async createReport(report) {
    const r = {
      statusHistory: [],
      images: [],
      ...report,
      id: report.id || nextNumId('LL'),
      reference: report.reference || ('LL-' + crypto.randomBytes(3).toString('hex').toUpperCase()),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state().reports.push(r);
    return { ...r };
  },

  async findReportById(id) {
    const r = state().reports.find(x => x.id === String(id));
    return r ? { ...r } : null;
  },

  async findReportByReference(reference) {
    const r = state().reports.find(x => x.reference === reference);
    return r ? { ...r } : null;
  },

  async listReports(orgId, filters = {}) {
    let reports = state().reports.filter(r => r.organizationId === String(orgId));
    if (filters.type) reports = reports.filter(r => r.type === filters.type);
    if (filters.status) reports = reports.filter(r => r.status === filters.status);
    if (filters.category) reports = reports.filter(r => (r.category || '').toLowerCase().includes(String(filters.category).toLowerCase()));
    if (filters.userId) reports = reports.filter(r => r.userId === String(filters.userId));
    if (filters.excludeUserId) reports = reports.filter(r => r.userId !== String(filters.excludeUserId));
    if (filters.from) reports = reports.filter(r => new Date(r.createdAt) >= new Date(filters.from));
    if (filters.to) reports = reports.filter(r => new Date(r.createdAt) <= new Date(filters.to));
    if (filters.search) reports = reports.filter(r => matchesTerm(r, filters.search));
    reports = reports.sort(byNewest);
    return paginate(reports, filters, 'reports');
  },

  async updateReport(id, patch) {
    const r = state().reports.find(x => x.id === String(id));
    if (!r) return null;
    Object.assign(r, patch, { updatedAt: new Date().toISOString() });
    return { ...r };
  },

  /**
   * Rewind a report's createdAt/updatedAt to a past instant. See the note on the
   * Mongo implementation: without this, seeded history is all filed under the
   * seed run date and the date filters/charts lose their meaning.
   */
  async backdateReport(id, at) {
    const r = state().reports.find(x => x.id === String(id));
    if (!r || !at) return null;
    const when = new Date(at).toISOString();
    r.createdAt = when;
    r.updatedAt = when;
    return { ...r };
  },

  async deleteReport(id) {
    const idx = state().reports.findIndex(r => r.id === String(id));
    if (idx === -1) return false;
    state().reports.splice(idx, 1);
    return true;
  },

  async countReportsByStatus(orgId, userId) {
    return state().reports
      .filter(r => r.organizationId === String(orgId) && (!userId || r.userId === String(userId)))
      .reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  },

  // ---- Matches ----
  async createMatch(match) {
    const m = {
      scores: {}, weights: {}, evidence: [], notified: false,
      ...match,
      id: match.id || nextNumId('M'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state().matches.push(m);
    return { ...m };
  },

  async findMatchById(id) {
    const m = state().matches.find(x => x.id === String(id));
    return m ? { ...m } : null;
  },

  async findMatchByReportPair(lostReportId, foundReportId) {
    const m = state().matches.find(x => x.lostReportId === lostReportId && x.foundReportId === foundReportId);
    return m ? { ...m } : null;
  },

  async listMatches(orgId, filters = {}) {
    let matches = state().matches.filter(m => m.organizationId === String(orgId));
    if (filters.status) {
      const list = Array.isArray(filters.status) ? filters.status : [filters.status];
      matches = matches.filter(m => list.includes(m.status));
    }
    if (filters.minScore) matches = matches.filter(m => m.finalScore >= Number(filters.minScore));
    if (filters.maxScore) matches = matches.filter(m => m.finalScore <= Number(filters.maxScore));
    if (filters.reportId) matches = matches.filter(m => m.lostReportId === filters.reportId || m.foundReportId === filters.reportId);
    matches = matches.sort((a, b) => b.finalScore - a.finalScore || new Date(b.createdAt) - new Date(a.createdAt));
    return paginate(matches, filters, 'matches');
  },

  async updateMatch(id, patch) {
    const m = state().matches.find(x => x.id === String(id));
    if (!m) return null;
    Object.assign(m, patch, { updatedAt: new Date().toISOString() });
    return { ...m };
  },

  async listMatchesForReports(reportIds) {
    return state().matches
      .filter(m => reportIds.includes(m.lostReportId) || reportIds.includes(m.foundReportId))
      .map(m => ({ ...m }));
  },

  // ---- Verifications ----
  async createVerification(verification) {
    const v = {
      attempts: 0,
      ...verification,
      id: verification.id || nextNumId('V'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state().verifications.push(v);
    return { ...v };
  },

  async findVerificationById(id) {
    const v = state().verifications.find(x => x.id === String(id));
    return v ? { ...v } : null;
  },

  async listVerifications(orgId, filters = {}) {
    let verifications = state().verifications.filter(v => v.organizationId === String(orgId));
    if (filters.status) verifications = verifications.filter(v => v.status === filters.status);
    if (filters.matchId) verifications = verifications.filter(v => v.matchId === filters.matchId);
    if (filters.claimantUserId) verifications = verifications.filter(v => v.claimantUserId === String(filters.claimantUserId));
    if (filters.reportId) verifications = verifications.filter(v => v.reportId === filters.reportId);
    return verifications.sort(byNewest);
  },

  async updateVerification(id, patch) {
    const v = state().verifications.find(x => x.id === String(id));
    if (!v) return null;
    Object.assign(v, patch, { updatedAt: new Date().toISOString() });
    return { ...v };
  },

  // ---- Notifications ----
  async createNotification(notification) {
    const n = {
      read: false, meta: {},
      ...notification,
      id: notification.id || nextNumId('N'),
      createdAt: new Date().toISOString()
    };
    state().notifications.push(n);
    return { ...n };
  },

  async createNotifications(list) {
    return Promise.all(list.map(n => memoryDriver.createNotification(n)));
  },

  async listNotifications(userId, orgId, filters = {}) {
    let notifications = state().notifications.filter(n => n.userId === String(userId) && n.organizationId === String(orgId));
    if (filters.read !== undefined) notifications = notifications.filter(n => n.read === filters.read);
    if (filters.type) {
      const list = Array.isArray(filters.type) ? filters.type : [filters.type];
      notifications = notifications.filter(n => list.includes(n.type));
    }
    notifications = notifications.sort(byNewest);
    return paginate(notifications, { ...filters, limit: filters.limit || 100 }, 'notifications');
  },

  async markNotificationRead(id, userId) {
    const n = state().notifications.find(x => x.id === String(id) && x.userId === String(userId));
    if (!n) return null;
    n.read = true;
    return { ...n };
  },

  async markAllNotificationsRead(userId, orgId) {
    let changed = 0;
    state().notifications
      .filter(n => n.userId === String(userId) && n.organizationId === String(orgId) && !n.read)
      .forEach((n) => { n.read = true; changed += 1; });
    return changed;
  },

  async countUnreadNotifications(userId, orgId) {
    return state().notifications.filter(n => n.userId === String(userId) && n.organizationId === String(orgId) && !n.read).length;
  },

  async countNotificationsByType(userId, orgId) {
    return state().notifications
      .filter(n => n.userId === String(userId) && n.organizationId === String(orgId))
      .reduce((acc, n) => {
        acc[n.type] = (acc[n.type] || 0) + 1;
        acc.total = (acc.total || 0) + 1;
        if (!n.read) {
          acc[`${n.type}:unread`] = (acc[`${n.type}:unread`] || 0) + 1;
          acc.unread = (acc.unread || 0) + 1;
        }
        return acc;
      }, {});
  },

  // ---- Returns ----
  async createReturn(returnObj) {
    const r = {
      timestamps: {},
      ...returnObj,
      id: returnObj.id || nextNumId('R'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state().returns.push(r);
    return { ...r };
  },

  async findReturnById(id) {
    const r = state().returns.find(x => x.id === String(id));
    return r ? { ...r } : null;
  },

  async findReturnByReportId(reportId) {
    const r = state().returns.find(x => x.reportId === String(reportId));
    return r ? { ...r } : null;
  },

  async findReturnByQrToken(token) {
    if (!token) return null;
    const r = state().returns.find(x => x.qrToken === String(token));
    return r ? { ...r } : null;
  },

  async listReturns(orgId, filters = {}) {
    let returns = state().returns.filter(r => r.organizationId === String(orgId));
    if (filters.reportId) returns = returns.filter(r => r.reportId === filters.reportId);
    if (filters.status) returns = returns.filter(r => r.status === filters.status);
    if (filters.verifiedUserId) returns = returns.filter(r => r.verifiedUserId === String(filters.verifiedUserId));
    return returns.sort(byNewest);
  },

  async updateReturn(id, patch) {
    const r = state().returns.find(x => x.id === String(id));
    if (!r) return null;
    Object.assign(r, patch, { updatedAt: new Date().toISOString() });
    return { ...r };
  },

  // ---- Custody records (chain of custody) ----
  async createCustodyRecord(record) {
    const r = {
      matchId: null, returnId: null, fromCustodian: '', toCustodian: '',
      location: '', note: '', evidence: [],
      ...record,
      id: record.id || nextNumId('CUS'),
      occurredAt: record.occurredAt || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state().custodyRecords.push(r);
    return { ...r };
  },

  async findCustodyRecordById(id) {
    const r = state().custodyRecords.find(x => x.id === String(id));
    return r ? { ...r } : null;
  },

  async listCustodyRecords(orgId, filters = {}) {
    let records = state().custodyRecords.filter(r => r.organizationId === String(orgId));
    if (filters.reportId) records = records.filter(r => r.reportId === String(filters.reportId));
    if (filters.event) records = records.filter(r => r.event === filters.event);
    if (filters.from) records = records.filter(r => new Date(r.occurredAt) >= new Date(filters.from));
    if (filters.to) records = records.filter(r => new Date(r.occurredAt) <= new Date(filters.to));
    records = records.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
    return paginate(records, filters, 'records');
  },

  /** Oldest first — a chain of custody reads forwards. */
  async listCustodyRecordsForReport(reportId) {
    return state().custodyRecords
      .filter(r => r.reportId === String(reportId))
      .map(r => ({ ...r }))
      .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  },

  // ---- Audit Logs ----
  async createAuditLog(log) {
    const l = { ...log, id: log.id || nextNumId('AUD'), createdAt: new Date().toISOString() };
    state().auditLogs.push(l);
    return { ...l };
  },

  async listAuditLogs(orgId, filters = {}) {
    let logs = state().auditLogs.filter(l => l.organizationId === String(orgId));
    if (filters.userId) logs = logs.filter(l => l.userId === filters.userId);
    if (filters.action) logs = logs.filter(l => l.action === filters.action);
    if (filters.entityType) logs = logs.filter(l => l.entityType === filters.entityType);
    if (filters.entityId) logs = logs.filter(l => l.entityId === filters.entityId);
    if (filters.startDate) logs = logs.filter(l => new Date(l.createdAt) >= new Date(filters.startDate));
    if (filters.endDate) logs = logs.filter(l => new Date(l.createdAt) <= new Date(filters.endDate));
    logs = logs.sort(byNewest);
    return paginate(logs, filters, 'logs');
  },

  async listActionTypes(orgId) {
    return Array.from(new Set(
      state().auditLogs.filter(l => !orgId || l.organizationId === String(orgId)).map(l => l.action)
    ));
  },

  // ---- Analytics ----
  async getOrgStats(orgId, period = '30d') {
    const from = periodStart(period);
    const reports = state().reports.filter(r => r.organizationId === String(orgId));
    const matches = state().matches.filter(m => m.organizationId === String(orgId));
    const returns = state().returns.filter(r => r.organizationId === String(orgId));
    const users = state().users.filter(u => (u.memberships || []).some(m => m.orgId === String(orgId)));
    const verifications = state().verifications.filter(v => v.organizationId === String(orgId));

    const lost = reports.filter(r => r.type === 'LOST');
    const found = reports.filter(r => r.type === 'FOUND');
    const completed = returns.filter(r => r.status === 'COMPLETED');
    const windowMs = Date.now() - from.getTime();

    const byCategory = reports.reduce((acc, r) => {
      const k = r.category || 'Uncategorised';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const byStatus = reports.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    return {
      totalReports: reports.length,
      lostReports: lost.length,
      foundReports: found.length,
      matches: matches.length,
      highConfidenceMatches: matches.filter(m => m.finalScore >= 85).length,
      verifiedReturns: completed.length,
      pendingVerifications: verifications.filter(v => v.status === 'PENDING').length,
      unresolvedItems: reports.filter(r => !['RETURNED', 'CLOSED'].includes(r.status)).length,
      members: users.length,
      matchRate: reports.length ? Math.round((matches.length / reports.length) * 100) : 0,
      returnRate: matches.length ? Math.round((completed.length / matches.length) * 100) : 0,
      resolutionRate: reports.length ? Math.round((reports.filter(r => r.status === 'RETURNED').length / reports.length) * 100) : 0,
      thisPeriodReports: reports.filter(r => new Date(r.createdAt) >= from).length,
      previousPeriodReports: reports.filter(r => {
        const t = new Date(r.createdAt).getTime();
        return t >= from.getTime() - windowMs && t < from.getTime();
      }).length,
      byCategory,
      byStatus,
      weeklyActivity: activitySeries(reports.map(r => r.createdAt), period),
      recentMatches: matches
        .slice()
        .sort(byNewest)
        .slice(0, 5)
        .map(m => ({ ...m }))
    };
  },

  async getUserStats(userId, orgId, period = '30d') {
    const from = periodStart(period);
    const reports = state().reports.filter(r => r.userId === String(userId) && r.organizationId === String(orgId));
    const reportIds = reports.map(r => r.id);
    const matches = state().matches.filter(m =>
      m.organizationId === String(orgId) && (reportIds.includes(m.lostReportId) || reportIds.includes(m.foundReportId)));
    const notifications = state().notifications.filter(n => n.userId === String(userId) && n.organizationId === String(orgId));
    const returns = state().returns.filter(r => r.organizationId === String(orgId) && r.verifiedUserId === String(userId));

    const lost = reports.filter(r => r.type === 'LOST');
    const found = reports.filter(r => r.type === 'FOUND');
    const windowMs = Date.now() - from.getTime();

    const byCategory = reports.reduce((acc, r) => {
      const k = r.category || 'Uncategorised';
      acc[k] = (acc[k] || 0) + 1;
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
      thisPeriodReports: reports.filter(r => new Date(r.createdAt) >= from).length,
      previousPeriodReports: reports.filter(r => {
        const t = new Date(r.createdAt).getTime();
        return t >= from.getTime() - windowMs && t < from.getTime();
      }).length,
      byCategory,
      byStatus: reports.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {}),
      weeklyActivity: activitySeries(reports.map(r => r.createdAt), period)
    };
  },

  async search(orgId, term, { limit = 8, userId } = {}) {
    const scoped = state().reports.filter(r => r.organizationId === String(orgId) && matchesTerm(r, term));
    const mine = userId ? scoped.filter(r => r.userId === String(userId)) : scoped;

    const matches = [];
    for (const m of state().matches.filter(x => x.organizationId === String(orgId) && x.finalScore >= 40)) {
      const lost = state().reports.find(r => r.id === m.lostReportId);
      const found = state().reports.find(r => r.id === m.foundReportId);
      if (matchesTerm(lost, term) || matchesTerm(found, term)) {
        matches.push({ match: { ...m }, lost: lost ? { ...lost } : null, found: found ? { ...found } : null });
      }
    }

    return {
      lostReports: mine.filter(r => r.type === 'LOST').slice(0, limit).map(r => ({ ...r })),
      foundReports: mine.filter(r => r.type === 'FOUND').slice(0, limit).map(r => ({ ...r })),
      matches: matches.slice(0, limit)
    };
  }
};

module.exports = memoryDriver;
