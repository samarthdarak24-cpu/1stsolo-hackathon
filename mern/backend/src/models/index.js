/**
 * Mongoose schemas + plain-object serializers.
 *
 * These live outside the Mongo driver so any module (services, scripts, tests)
 * can require them without booting the store. `mongoose.models.X ||` guards keep
 * repeated requires (driver + service) from throwing OverwriteModelError.
 */
const mongoose = require('mongoose');

const Mixed = mongoose.Schema.Types.Mixed;

const membershipSchema = new mongoose.Schema({
  orgId: { type: String, required: true },
  role: { type: String, enum: ['owner', 'admin', 'member', 'staff', 'security'], default: 'member' },
  joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  phone: { type: String, default: '' },
  avatarUrl: { type: String, default: '' },
  bio: { type: String, default: '' },
  isVerified: { type: Boolean, default: false },
  activeOrgId: { type: String, default: null },
  preferences: {
    emailAlerts: { type: Boolean, default: true },
    matchAlerts: { type: Boolean, default: true },
    verificationAlerts: { type: Boolean, default: true },
    returnAlerts: { type: Boolean, default: true },
    shareLocation: { type: Boolean, default: true },
    cctvConsent: { type: Boolean, default: false }
  },
  notificationPrefs: { type: Mixed, default: {} },
  sessions: { type: [Mixed], default: [] },
  resetToken: { type: String, default: null },
  resetTokenExpiry: { type: Date, default: null },
  memberships: { type: [membershipSchema], default: [] }
}, { timestamps: true });

const orgSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['school', 'college', 'company', 'hospital', 'office', 'event', 'campus', 'other'], required: true },
  emailDomains: { type: [String], default: [] },
  verifiedDomains: { type: [String], default: [] },
  location: { type: String, default: '' },
  logoUrl: { type: String, default: '' },
  inviteCode: { type: String, required: true, unique: true },
  ownerId: { type: String, default: null },
  verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  settings: { type: Mixed, default: {} }
}, { timestamps: true });

const itemProfileSchema = new mongoose.Schema({
  itemName: { type: String, default: '' },
  category: { type: String, default: '' },
  primaryColor: { type: String, default: '' },
  secondaryColor: { type: String, default: '' },
  brand: { type: String, default: '' },
  model: { type: String, default: '' },
  material: { type: String, default: '' },
  shape: { type: String, default: '' },
  visibleMark: { type: String, default: '' },
  serialNumber: { type: String, default: '' },
  ocrText: { type: String, default: '' },
  size: { type: String, default: '' },
  condition: { type: String, default: '' },
  finderNotes: { type: String, default: '' },
  estimatedValue: { type: String, default: '' },
  aiConfidence: { type: Number, default: 0 },
  aiFields: { type: [String], default: [] },
  analysisVersion: { type: String, default: '' }
}, { _id: false });

const reportSchema = new mongoose.Schema({
  organizationId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  type: { type: String, enum: ['LOST', 'FOUND'], required: true },
  reference: { type: String, default: '' },
  itemProfile: { type: Mixed, required: true },
  images: { type: [String], default: [] },
  description: { type: String, required: true },
  category: { type: String, required: true },
  location: { type: String, required: true },
  coordinates: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
  lostAt: { type: Date },
  foundAt: { type: Date },
  status: { type: String, default: 'REPORTED' },
  statusHistory: { type: [Mixed], default: [] },
  lastSeen: { type: Mixed },
  cctvEvents: { type: [String], default: [] },
  // Structured evidence rows. `cctvEvents` above is the human one-liner kept for
  // display; this is the checkable record (label, confidence, track, frame count)
  // so an auditor never has to parse a sentence to test a claim.
  cctvEvidence: { type: [Mixed], default: [] },
  embedding: { type: [Number], default: [] },
  textEmbedding: { type: [Number], default: [] },
  embeddingSources: { type: Mixed, default: {} },
  embeddingUpdatedAt: { type: Date, default: null },
  matchState: { type: Mixed, default: {} }
}, { timestamps: true });

/*
 * Compound indexes, one per query the app actually issues (see mongoDriver).
 * Mongo can only use ONE index per query, so the single-field `index: true` flags
 * above cannot serve an org-scoped list: `{organizationId}` alone still sorts
 * in memory, and at a few hundred thousand rows that is a collection scan with
 * a blocking sort. These cover the access path end-to-end (filter + sort).
 */
reportSchema.index({ organizationId: 1, createdAt: -1, _id: -1 }); // list + CSV export walk
reportSchema.index({ organizationId: 1, type: 1, status: 1 }); // lost/found queues
reportSchema.index({ organizationId: 1, userId: 1, createdAt: -1 }); // "my reports"
reportSchema.index({ organizationId: 1, status: 1 }); // dashboard status counts
reportSchema.index({ organizationId: 1, reference: 1 }); // reference lookup

const matchSchema = new mongoose.Schema({
  organizationId: { type: String, required: true, index: true },
  lostReportId: { type: String, required: true },
  foundReportId: { type: String, required: true },
  visualScore: { type: Number, default: 0 },
  semanticScore: { type: Number, default: 0 },
  attributeScore: { type: Number, default: 0 },
  locationScore: { type: Number, default: 0 },
  timeScore: { type: Number, default: 0 },
  categoryScore: { type: Number, default: 0 },
  contextScore: { type: Number, default: 0 },
  finalScore: { type: Number, default: 0 },
  scores: { type: Mixed, default: {} },
  weights: { type: Mixed, default: {} },
  evidence: { type: [Mixed], default: [] },
  explanation: { type: String, default: '' },
  status: { type: String, default: 'PENDING_VERIFICATION' },
  // Cross-modal consistency (see ai-service matching.score_consistency). Kept on
  // the match, not only in the request that produced it, because a reviewer
  // opening this candidate a week later must still see that the signals
  // disagreed - and why.
  consistency: { type: Mixed, default: null },
  flags: { type: [String], default: [] },
  notified: { type: Boolean, default: false },
  reviewedBy: { type: String },
  reviewedAt: { type: Date },
  reviewNotes: { type: String }
}, { timestamps: true });

// Match list is "highest score first, inside my org"; the pair lookup is how a
// re-run asks whether this exact pair was already matched.
matchSchema.index({ organizationId: 1, finalScore: -1 });
matchSchema.index({ organizationId: 1, status: 1 });
matchSchema.index({ lostReportId: 1, foundReportId: 1 });
matchSchema.index({ foundReportId: 1 }); // the $or side of listMatchesForReports

const verificationSchema = new mongoose.Schema({
  organizationId: { type: String, required: true, index: true },
  matchId: { type: String, required: true },
  reportId: { type: String, required: true },
  claimantUserId: { type: String, required: true },
  challenge: { type: Mixed, required: true },
  expectedEvidence: { type: Mixed },
  claimantAnswer: { type: Mixed },
  attempts: { type: Number, default: 0 },
  verificationScore: { type: Number, default: 0 },
  status: { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED', 'REVIEW'], default: 'PENDING' },
  reviewedBy: { type: String },
  reviewedAt: { type: Date },
  reviewNotes: { type: String }
}, { timestamps: true });

verificationSchema.index({ organizationId: 1, reportId: 1 });
verificationSchema.index({ organizationId: 1, status: 1 });
verificationSchema.index({ matchId: 1 });

const notificationSchema = new mongoose.Schema({
  organizationId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  type: { type: String, required: true, index: true },
  title: { type: String, required: true },
  message: { type: String },
  referenceId: { type: String },
  referenceType: { type: String, default: '' },
  meta: { type: Mixed, default: {} },
  read: { type: Boolean, default: false }
}, { timestamps: true });

// The bell badge and the list are the same walk: one user, one org, newest first.
// The type index backs the per-category counts the notifications page shows.
notificationSchema.index({ userId: 1, organizationId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, organizationId: 1, type: 1 });

const returnSchema = new mongoose.Schema({
  organizationId: { type: String, required: true, index: true },
  reportId: { type: String, required: true, unique: true },
  verifiedUserId: { type: String, required: true },
  qrToken: { type: String, required: true, unique: true },
  qrExpiresAt: { type: Date, default: null },
  usedAt: { type: Date, default: null },
  otp: { type: String },
  handoverStaffId: { type: String },
  pickupLocation: { type: String },
  instructions: { type: String, default: '' },
  status: { type: String, enum: ['PENDING', 'READY', 'COMPLETED', 'EXPIRED', 'REJECTED'], default: 'PENDING' },
  timestamps: { type: Mixed, default: {} }
}, { timestamps: true });

returnSchema.index({ organizationId: 1, status: 1 });
returnSchema.index({ organizationId: 1, verifiedUserId: 1 });

const auditLogSchema = new mongoose.Schema({
  organizationId: { type: String, required: true, index: true },
  userId: { type: String, index: true },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  metadata: { type: Mixed, default: {} },
  ip: { type: String },
  userAgent: { type: String }
}, { timestamps: true });

// Audit reads are always "this org, newest first, filtered by one dimension".
// `_id` closes the sort so paging (and the CSV export) is stable across pages.
auditLogSchema.index({ organizationId: 1, createdAt: -1, _id: -1 });
auditLogSchema.index({ organizationId: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, entityType: 1, entityId: 1 });

/**
 * Chain-of-custody record: one row per physical hand-off of ONE item.
 *
 * `fromCustodian` -> `toCustodian` is the actual chain; everything else is
 * context. Records are append-only — a correction is a new row, never an edit,
 * which is what makes the chain defensible.
 */
const custodyRecordSchema = new mongoose.Schema({
  organizationId: { type: String, required: true, index: true },
  reportId: { type: String, required: true, index: true },
  matchId: { type: String, default: null },
  returnId: { type: String, default: null },
  event: {
    type: String,
    enum: ['LOGGED', 'STORED', 'MOVED', 'HANDED_TO_STAFF', 'HANDED_OVER', 'RELEASED', 'DISPOSED', 'NOTE'],
    default: 'NOTE'
  },
  fromCustodian: { type: String, default: '' },
  toCustodian: { type: String, default: '' },
  location: { type: String, default: '' },
  note: { type: String, default: '' },
  evidence: { type: [String], default: [] },
  actorUserId: { type: String, default: null },
  actorName: { type: String, default: '' },
  occurredAt: { type: Date, default: Date.now, index: true },
  // Tamper-evidence: sha256 over this row's content plus the previous row's
  // digest. See services/custodyChain.js. Rows written before this existed have
  // empty digests and are reported as legacy, not as tampering.
  prevHash: { type: String, default: '' },
  hash: { type: String, default: '' }
}, { timestamps: true });

// The chain is always read for ONE item in occurrence order - that order is the
// hash order, so it must come back from the index rather than be re-sorted.
custodyRecordSchema.index({ organizationId: 1, reportId: 1, occurredAt: 1 });
custodyRecordSchema.index({ organizationId: 1, returnId: 1 });

// listMembers() and every "is this user in my org" check filter on the array.
userSchema.index({ 'memberships.orgId': 1 });

const define = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

const User = define('User', userSchema);
const Organization = define('Organization', orgSchema);
const Report = define('Report', reportSchema);
const Match = define('Match', matchSchema);
const Verification = define('Verification', verificationSchema);
const Notification = define('Notification', notificationSchema);
const ReturnCase = define('Return', returnSchema);
const CustodyRecord = define('CustodyRecord', custodyRecordSchema);
const AuditLog = define('AuditLog', auditLogSchema);

/* ------------------------------------------------------------------ */
/* Serializers — convert mongoose docs to the plain API shape.         */
/* ------------------------------------------------------------------ */

const toUser = (u) => u && {
  id: String(u._id),
  name: u.name,
  email: u.email,
  passwordHash: u.passwordHash,
  phone: u.phone || '',
  avatarUrl: u.avatarUrl || '',
  bio: u.bio || '',
  isVerified: u.isVerified,
  createdAt: u.createdAt,
  activeOrgId: u.activeOrgId || null,
  preferences: u.preferences || {},
  notificationPrefs: u.notificationPrefs || {},
  sessions: u.sessions || [],
  resetToken: u.resetToken || null,
  resetTokenExpiry: u.resetTokenExpiry || null,
  memberships: (u.memberships || []).map(m => ({ orgId: m.orgId, role: m.role, joinedAt: m.joinedAt }))
};

const toOrg = (o) => o && {
  id: String(o._id),
  name: o.name,
  type: o.type,
  emailDomain: (o.emailDomains || [])[0] || '',
  emailDomains: o.emailDomains || [],
  verifiedDomains: o.verifiedDomains || [],
  location: o.location || '',
  logoUrl: o.logoUrl || '',
  inviteCode: o.inviteCode,
  ownerId: o.ownerId || null,
  verificationStatus: o.verificationStatus || 'pending',
  settings: o.settings || {},
  createdAt: o.createdAt
};

const toReport = (r) => r && {
  id: String(r._id),
  organizationId: r.organizationId,
  userId: r.userId,
  type: r.type,
  reference: r.reference || '',
  itemProfile: r.itemProfile,
  images: r.images || [],
  description: r.description,
  category: r.category,
  location: r.location,
  coordinates: r.coordinates || { lat: null, lng: null },
  lostAt: r.lostAt,
  foundAt: r.foundAt,
  status: r.status,
  statusHistory: r.statusHistory || [],
  lastSeen: r.lastSeen,
  cctvEvents: r.cctvEvents || [],
  cctvEvidence: r.cctvEvidence || [],
  createdAt: r.createdAt,
  updatedAt: r.updatedAt
};

const toMatch = (m) => m && {
  id: String(m._id),
  organizationId: m.organizationId,
  lostReportId: m.lostReportId,
  foundReportId: m.foundReportId,
  visualScore: m.visualScore,
  semanticScore: m.semanticScore,
  attributeScore: m.attributeScore,
  locationScore: m.locationScore,
  timeScore: m.timeScore,
  categoryScore: m.categoryScore,
  contextScore: m.contextScore,
  finalScore: m.finalScore,
  scores: m.scores || {},
  weights: m.weights || {},
  evidence: m.evidence || [],
  explanation: m.explanation || '',
  consistency: m.consistency || null,
  flags: m.flags || [],
  status: m.status,
  notified: m.notified,
  reviewedBy: m.reviewedBy,
  reviewedAt: m.reviewedAt,
  reviewNotes: m.reviewNotes,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt
};

const toVerification = (v) => v && {
  id: String(v._id),
  organizationId: v.organizationId,
  matchId: v.matchId,
  reportId: v.reportId,
  claimantUserId: v.claimantUserId,
  challenge: v.challenge,
  expectedEvidence: v.expectedEvidence,
  claimantAnswer: v.claimantAnswer,
  attempts: v.attempts || 0,
  verificationScore: v.verificationScore,
  status: v.status,
  reviewedBy: v.reviewedBy,
  reviewedAt: v.reviewedAt,
  reviewNotes: v.reviewNotes,
  createdAt: v.createdAt,
  updatedAt: v.updatedAt
};

const toNotification = (n) => n && {
  id: String(n._id),
  organizationId: n.organizationId,
  userId: n.userId,
  type: n.type,
  title: n.title,
  message: n.message,
  referenceId: n.referenceId,
  referenceType: n.referenceType || '',
  meta: n.meta || {},
  read: n.read,
  createdAt: n.createdAt
};

const toReturn = (r) => r && {
  id: String(r._id),
  organizationId: r.organizationId,
  reportId: r.reportId,
  verifiedUserId: r.verifiedUserId,
  qrToken: r.qrToken,
  qrExpiresAt: r.qrExpiresAt || null,
  usedAt: r.usedAt || null,
  otp: r.otp,
  handoverStaffId: r.handoverStaffId,
  pickupLocation: r.pickupLocation,
  instructions: r.instructions || '',
  status: r.status,
  timestamps: r.timestamps || {},
  createdAt: r.createdAt,
  updatedAt: r.updatedAt
};

const toAuditLog = (l) => l && {
  id: String(l._id),
  organizationId: l.organizationId,
  userId: l.userId,
  action: l.action,
  entityType: l.entityType,
  entityId: l.entityId,
  metadata: l.metadata || {},
  ip: l.ip,
  userAgent: l.userAgent,
  createdAt: l.createdAt
};

const toCustodyRecord = (c) => c && {
  id: String(c._id),
  organizationId: c.organizationId,
  reportId: c.reportId,
  matchId: c.matchId || null,
  returnId: c.returnId || null,
  event: c.event || 'NOTE',
  fromCustodian: c.fromCustodian || '',
  toCustodian: c.toCustodian || '',
  location: c.location || '',
  note: c.note || '',
  evidence: c.evidence || [],
  actorUserId: c.actorUserId || null,
  actorName: c.actorName || '',
  occurredAt: c.occurredAt,
  prevHash: c.prevHash || '',
  hash: c.hash || '',
  createdAt: c.createdAt,
  updatedAt: c.updatedAt
};

module.exports = {
  User,
  Organization,
  Report,
  Match,
  Verification,
  Notification,
  ReturnCase,
  CustodyRecord,
  AuditLog,
  toUser,
  toOrg,
  toReport,
  toMatch,
  toVerification,
  toNotification,
  toReturn,
  toCustodyRecord,
  toAuditLog
};
