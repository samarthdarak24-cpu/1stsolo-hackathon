/**
 * Zod request schemas. Parsed objects are what reach controllers, and zod strips
 * unknown keys, so a client cannot inject organizationId / userId / status.
 */
const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$|^mem_[a-z0-9]+$/i, 'Invalid id');
/**
 * Ids that the client sends BACK to us for an entity it already holds.
 *
 * Mongo hands out 24-hex ObjectIds, but the in-memory driver (the hackathon /
 * no-Mongo path) uses readable ids such as `LL-0009`, `M-0031` or `mem_0001`.
 * A strict ObjectId regex would therefore reject every demo request with a bare
 * "Invalid id", so entity ids are validated as bounded opaque strings instead.
 * Tenant scoping is enforced in the services, never by the shape of an id.
 */
const entityId = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Invalid id');
const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(80);
const shortText = z.string().trim().max(2000);
/**
 * Null-tolerant optionals.
 *
 * JSON has no `undefined`, so a client that means "I have nothing to send here"
 * has only two ways to say it: omit the key, or send `null`. Zod's `.optional()`
 * accepts the first and rejects the second, which turns harmless client
 * behaviour that every JavaScript client produces naturally (`JSON.stringify`
 * keeps `null`) into a 400 whose message no user can act on:
 *
 *   "Invalid input: expected object, received null"
 *
 * Every field this wraps is already optional — `null`, `''` and omission mean
 * the same thing to the services downstream — so accepting all three is
 * correcting the contract rather than loosening it. `.catch()` (not
 * `.nullish()`) is deliberate: the value is normalised to the documented empty
 * form, so the services keep receiving the `''`/`undefined` they already handle
 * instead of a `null` that Mongo would happily persist.
 */
const nullishText = (schema) => schema.catch('');
/**
 * `null` (and omission) normalise to `undefined` — "this object was not
 * provided". `.catch()` alone covers both: it returns the fallback when the key
 * is missing, and `undefined` keys are dropped from the parsed output, so the
 * services keep seeing exactly what they saw before.
 */
const nullToUndefined = (schema) => schema.catch(undefined);
/**
 * An optional URL/markdown-ish string: absent, `''` or `null` all become `''`
 * (the create/update services treat `''` as "not supplied").
 */
const optionalUrl = z.string().trim().max(2000).optional().or(z.literal('')).catch('');
/**
 * An organization logo may arrive as an uploaded URL OR as a data URL: the
 * branding step downscales the image in the browser to a 256px PNG and sends it
 * inline, because the organization API takes a string and nothing else. That
 * value is tens of kilobytes rather than a URL, so it cannot share the 2000
 * character cap above — that cap silently rejected every real logo. The 2 MB
 * JSON body limit is the actual backstop.
 */
const optionalLogo = z.string().trim().max(400_000).optional().or(z.literal(''));

/**
 * Credentials. The email pattern is deliberately the same loose shape the auth
 * service uses, so the schema and the service cannot disagree about a value the
 * user was told was acceptable.
 */
const email = z.string().trim().toLowerCase().min(5, 'A valid email is required').max(160)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'A valid email is required');
const password = z.string().min(6, 'Password must be at least 6 characters').max(200);

/* ---------------- auth ---------------- */
const registerSchema = z.object({
  name,
  email,
  password,
  organizationName: shortText.optional(),
  organizationType: z.enum(['school', 'college', 'company', 'hospital', 'office', 'event', 'campus', 'other']).optional(),
  inviteCode: z.string().trim().max(20).optional().or(z.literal(''))
});

const loginSchema = z.object({ email, password: z.string().min(1) });
const verifyEmailSchema = z.object({ email });
const forgotPasswordSchema = z.object({ email });
const resetPasswordSchema = z.object({ token: z.string().min(10), password });
const switchOrgSchema = z.object({ orgId: objectId });
const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });

/* ---------------- organizations ---------------- */
const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(['school', 'college', 'company', 'hospital', 'office', 'event', 'campus', 'other']),
  emailDomain: z.string().trim().toLowerCase().optional().or(z.literal('')),
  location: shortText.optional().or(z.literal('')),
  // Accepted at creation too, so the signup flow does not have to create the
  // tenant and then immediately PATCH branding onto it.
  logoUrl: optionalLogo
});
const joinOrgSchema = z.object({ inviteCode: z.string().trim().min(4).max(20) });
const updateOrgSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  type: z.enum(['school', 'college', 'company', 'hospital', 'office', 'event', 'campus', 'other']).optional(),
  location: shortText.optional().or(z.literal('')),
  logoUrl: optionalLogo
});
const setActiveOrgSchema = z.object({ orgId: objectId });

/* ---------------- reports ---------------- */
// Every attribute is a free text the user may edit or clear in the wizard, so a
// cleared field arrives as `''` or `null` depending on the client. Both mean
// "unknown", which is exactly what the empty string already means downstream.
const profileField = (max) => nullishText(z.string().max(max).optional().or(z.literal('')));

const itemProfileSchema = z.object({
  itemName: nullishText(shortText.optional().or(z.literal(''))),
  category: nullishText(shortText.optional().or(z.literal(''))),
  primaryColor: profileField(60),
  secondaryColor: profileField(60),
  brand: profileField(120),
  model: profileField(120),
  material: profileField(120),
  shape: profileField(60),
  visibleMark: nullishText(shortText.optional().or(z.literal(''))),
  serialNumber: profileField(120),
  size: profileField(60),
  condition: profileField(120),
  finderNotes: nullishText(shortText.optional().or(z.literal(''))),
  estimatedValue: profileField(60),
  ocrText: nullishText(shortText.optional().or(z.literal('')))
}).passthrough();

/**
 * A pin, when there is one. `{ lat: null, lng: null }` is the client's "the map
 * was never used" and is equivalent to not sending the key at all, so it
 * normalises to `undefined` rather than being persisted as two nulls.
 */
const coordinatesSchema = nullToUndefined(
  z.object({ lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable() })
);

const reportBase = {
  itemProfile: itemProfileSchema,
  images: z.array(z.string().max(2000)).max(6).optional().default([]).catch([]),
  description: z.string().trim().min(10, 'Please describe the item in at least 10 characters').max(4000),
  category: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(400),
  coordinates: coordinatesSchema,
  lastSeen: nullToUndefined(z.object({
    location: nullishText(z.string().max(400).optional()),
    time: nullishText(z.string().optional()),
    landmark: nullishText(z.string().max(300).optional()),
    notes: nullishText(z.string().max(1000).optional())
  }))
};

const lostReportSchema = z.object({ ...reportBase, lostAt: z.string().datetime({ offset: true }).or(z.string().min(8)) });
const foundReportSchema = z.object({ ...reportBase, foundAt: z.string().datetime({ offset: true }).or(z.string().min(8)) });

const updateReportSchema = z.object({
  itemProfile: itemProfileSchema.optional(),
  images: z.array(z.string().max(2000)).max(6).optional(),
  description: z.string().trim().min(10).max(4000).optional(),
  category: z.string().trim().min(2).max(120).optional(),
  location: z.string().trim().min(2).max(400).optional(),
  coordinates: coordinatesSchema,
  lostAt: z.string().optional(),
  foundAt: z.string().optional(),
  lastSeen: nullToUndefined(z.object({}).passthrough()),
  status: z.enum(['MATCHING', 'POTENTIAL_MATCH', 'VERIFICATION_PENDING', 'VERIFIED', 'RETURN_READY', 'RETURNED', 'CLOSED']).optional(),
  statusNote: z.string().max(500).optional()
});

/**
 * Detaching a photo from an item. The url is one the client already holds
 * (returned by POST /api/reports/:id/image), and the service re-checks that it
 * really is attached to THIS report before anything is written.
 */
const removeReportImageSchema = z.object({
  url: z.string().trim().min(1, 'A photo url is required').max(2000)
});

const listReportsQuery = z.object({
  type: z.enum(['LOST', 'FOUND']).optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  scope: z.enum(['mine', 'all']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
  offset: z.coerce.number().min(0).optional()
});

/* ---------------- matches ---------------- */
const listMatchesQuery = z.object({
  status: z.string().optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  search: z.string().optional(),
  scope: z.enum(['mine', 'all']).optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
  offset: z.coerce.number().min(0).optional()
});
const reviewMatchSchema = z.object({
  action: z.enum(['approve', 'reject', 'escalate']),
  notes: z.string().max(1000).optional()
});

/* ---------------- verifications ---------------- */
const startVerificationSchema = z.object({ matchId: entityId });
const answerVerificationSchema = z.object({ answer: z.string().trim().min(2).max(2000), evidence: z.string().max(2000).optional() });
const reviewVerificationSchema = z.object({ action: z.enum(['approve', 'reject', 'request-more']), notes: z.string().max(1000).optional() });
const listVerificationsQuery = z.object({ status: z.string().optional(), matchId: entityId.optional() });

/* ---------------- notifications ---------------- */
const listNotificationsQuery = z.object({
  read: z.enum(['true', 'false']).optional(),
  type: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
  offset: z.coerce.number().min(0).optional()
});

/* ---------------- returns ---------------- */
const authorizeReturnSchema = z.object({
  pickupLocation: nullishText(z.string().trim().max(200).optional()),
  instructions: nullishText(z.string().max(1000).optional())
});
const scanQrSchema = z.object({ token: z.string().min(10), otp: z.string().max(12).optional() });

/* ---------------- custody (chain of custody) ---------------- */
const CUSTODY_EVENTS = ['LOGGED', 'STORED', 'MOVED', 'HANDED_TO_STAFF', 'HANDED_OVER', 'RELEASED', 'DISPOSED', 'NOTE'];

const addCustodyRecordSchema = z.object({
  event: z.enum(CUSTODY_EVENTS).default('NOTE'),
  fromCustodian: nullishText(z.string().trim().max(120).optional().or(z.literal(''))),
  toCustodian: nullishText(z.string().trim().max(120).optional().or(z.literal(''))),
  location: nullishText(z.string().trim().max(200).optional().or(z.literal(''))),
  note: nullishText(z.string().trim().max(1000).optional().or(z.literal(''))),
  // A cleared evidence attachment arrives as `null` from JSON clients; `[]` is
  // what the chain-of-custody hasher expects for "no evidence attached".
  evidence: z.array(z.string().max(2000)).max(6).optional().catch([]),
  occurredAt: z.string().datetime().optional()
});

const listCustodyQuery = z.object({
  reportId: entityId.optional(),
  event: z.enum(CUSTODY_EVENTS).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional(),
  offset: z.coerce.number().min(0).optional()
});

/* ---------------- CCTV / last-seen ---------------- */
// `videoPath` is a path that exists on the ANALYSIS SERVICE host, not here.
// The transcript of who requested which clip lands in the audit log.
const cctvAnalyzeSchema = z.object({
  reportId: entityId,
  videoPath: z.string().trim().min(1, 'A clip path on the analysis service is required').max(1000),
  camera: nullishText(z.string().trim().max(120).optional().or(z.literal(''))),
  location: nullishText(z.string().trim().max(200).optional().or(z.literal(''))),
  sampleFps: z.coerce.number().min(0.05).max(5).optional()
});

/* ---------------- org settings / members ---------------- */
const orgSettingsSchema = z.object({
  name: z.string().optional(),
  pickupLocation: z.string().optional(),
  instructions: z.string().optional(),
  matchThreshold: z.coerce.number().min(0).max(100).optional(),
  allowCctvRequests: z.coerce.boolean().optional(),
  requireVerification: z.coerce.boolean().optional(),
  matchAlerts: z.coerce.boolean().optional(),
  verificationAlerts: z.coerce.boolean().optional(),
  returnAlerts: z.coerce.boolean().optional()
}).passthrough();
const roleSchema = z.enum(['admin', 'member', 'staff', 'security']);
const updateRoleSchema = z.object({ role: roleSchema });
const inviteSchema = z.object({ email, role: roleSchema.optional() });

/* ---------------- profile / search ---------------- */
const updateProfileSchema = z.object({
  name: name.optional(),
  phone: nullishText(z.string().trim().max(32).optional().or(z.literal(''))),
  bio: nullishText(z.string().max(500).optional().or(z.literal(''))),
  avatarUrl: optionalUrl,
  preferences: nullToUndefined(z.object({
    matchAlerts: z.coerce.boolean().optional(),
    verificationAlerts: z.coerce.boolean().optional(),
    returnAlerts: z.coerce.boolean().optional(),
    emailAlerts: z.coerce.boolean().optional(),
    shareLocation: z.coerce.boolean().optional(),
    cctvConsent: z.coerce.boolean().optional()
  }))
});
/**
 * `limit` was capped at 20, but the visual discovery grid requests 40 and then
 * filters client-side by type/date/category/status — so 20 arriving rows meant a
 * filtered view of almost nothing. The cap is a query-cost bound, not a
 * permission: the search is already organization-scoped by `protect`.
 */
const searchQuery = z.object({ q: z.string().trim().min(1).max(120), limit: z.coerce.number().min(1).max(50).optional() });
const dashboardQuery = z.object({ period: z.enum(['7d', '30d', '90d', '1y']).optional() });
const analyticsQuery = z.object({ period: z.enum(['7d', '30d', '90d', '1y']).optional() });
const auditQuery = z.object({
  userId: objectId.optional(), action: z.string().optional(), entityType: z.string().optional(),
  startDate: z.string().optional(), endDate: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).optional(), offset: z.coerce.number().min(0).optional()
});

module.exports = {
  registerSchema, loginSchema, verifyEmailSchema, forgotPasswordSchema, resetPasswordSchema,
  switchOrgSchema, changePasswordSchema, createOrgSchema, joinOrgSchema, updateOrgSchema,
  setActiveOrgSchema, lostReportSchema, foundReportSchema, updateReportSchema, listReportsQuery,
  removeReportImageSchema,
  listMatchesQuery, reviewMatchSchema, startVerificationSchema, answerVerificationSchema,
  reviewVerificationSchema, listVerificationsQuery, listNotificationsQuery, authorizeReturnSchema,
  scanQrSchema, addCustodyRecordSchema, listCustodyQuery, cctvAnalyzeSchema,
  orgSettingsSchema, updateRoleSchema, inviteSchema, updateProfileSchema,
  searchQuery, dashboardQuery, analyticsQuery, auditQuery
};
