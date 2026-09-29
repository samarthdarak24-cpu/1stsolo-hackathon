/**
 * Auth service — registration, login, org switching, password reset, profile payload.
 */
const crypto = require('crypto');
const { getDriver } = require('../store');
const { AppError } = require('../utils/errors');
const { signToken, isFreeEmailDomain, extractDomain } = require('../middleware/auth');
const audit = require('./auditService');

const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * Roles that work the organization portal.
 *
 * Mirrors the backend's STAFF guard in routes/api.js (staff, security, admin,
 * owner). Staff and security hold org permissions such as match:review and
 * return:authorize, so sending them to the student dashboard hid the queue they
 * exist to work:
 */
const ORG_DASHBOARD_ROLES = ['owner', 'admin', 'staff', 'security'];

const dashboardTypeFor = (role) => (ORG_DASHBOARD_ROLES.includes(role) ? 'org' : 'user');

/** Shape returned to the frontend after login/register/me. */
async function buildAuthPayload(user, { includeOrgs = true } = {}) {
  const store = getDriver();
  const mem = (user.memberships || []).find(m => m.orgId === user.activeOrgId);
  const org = user.activeOrgId ? await store.findOrgById(user.activeOrgId) : null;

  let organizations = [];
  if (includeOrgs) {
    for (const m of user.memberships || []) {
      // eslint-disable-next-line no-await-in-loop
      const o = await store.findOrgById(m.orgId);
      if (o) organizations.push({ id: o.id, name: o.name, type: o.type, logoUrl: o.logoUrl, role: m.role, active: m.orgId === user.activeOrgId });
    }
  }

  const activeRole = mem?.role || null;
  return {
    token: signToken(user.id),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      isVerified: user.isVerified,
      phone: user.phone || '',
      avatarUrl: user.avatarUrl || '',
      activeOrgId: user.activeOrgId,
      memberships: user.memberships,
      preferences: user.preferences || {}
    },
    organizations,
    activeOrganization: org ? { id: org.id, name: org.name, type: org.type, location: org.location, logoUrl: org.logoUrl } : null,
    activeRole,
    dashboardType: dashboardTypeFor(activeRole),
    nextStep: !user.isVerified ? 'VERIFY_EMAIL' : (!user.activeOrgId ? 'JOIN_ORG' : 'DONE')
  };
}

async function checkDomain(emailAddress) {
  const store = getDriver();
  const domain = extractDomain(emailAddress);
  if (!domain) throw AppError.badRequest('Enter a valid email address');
  const free = isFreeEmailDomain(emailAddress);
  const org = await store.findOrgByDomain(domain);
  return {
    isFree: free,
    domain,
    organization: org ? { id: org.id, name: org.name, type: org.type, location: org.location } : null,
    requiresCode: Boolean(org) && free
  };
}

async function register({ name, email, password, organizationName, organizationType, inviteCode }) {
  const store = getDriver();
  const existing = await store.findUserByEmail(email);
  if (existing) throw AppError.conflict('An account with this email already exists');

  const user = await store.createUser({ name, email, password });

  // Optional: attach to an existing org (invite code) or create a new one.
  if (inviteCode) {
    const org = await store.findOrgByInviteCode(inviteCode);
    if (!org) throw AppError.badRequest('That invite code is not valid');
    await store.addMembership(user.id, org.id, 'member');
  } else if (organizationName && organizationType) {
    const org = await store.createOrg({ name: organizationName, type: organizationType, emailDomain: extractDomain(email), ownerId: user.id });
    await store.addMembership(user.id, org.id, 'owner');
  } else {
    const domain = extractDomain(email);
    const org = domain && !isFreeEmailDomain(email) ? await store.findOrgByDomain(domain) : null;
    if (org) await store.addMembership(user.id, org.id, 'member');
  }

  const fresh = await store.findUserById(user.id);
  return buildAuthPayload(fresh);
}

async function login({ email, password }) {
  const store = getDriver();
  // eslint-disable-next-line global-require
  const bcrypt = require('bcryptjs');
  const user = await store.findUserByEmail(email);
  if (!user) throw AppError.unauthorized('Incorrect email or password');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw AppError.unauthorized('Incorrect email or password');
  return buildAuthPayload(user);
}

async function getMe(req) {
  return buildAuthPayload(req.user);
}

async function switchOrg(req, orgId) {
  const store = getDriver();
  const mem = (req.user.memberships || []).find(m => m.orgId === orgId);
  if (!mem) throw AppError.forbidden('You are not a member of that organization');
  const updated = await store.updateUser(req.user.id, { activeOrgId: orgId });
  const payload = await buildAuthPayload(updated);
  if (updated.activeOrgId) {
    await audit(req, { organizationId: orgId, action: 'ORG_SWITCHED', entityType: 'ORGANIZATION', entityId: orgId, metadata: {} });
  }
  return payload;
}

async function verifyEmail(emailAddress) {
  const store = getDriver();
  const user = await store.findUserByEmail(emailAddress);
  if (!user) throw AppError.notFound('No account found for that email');
  if (user.isVerified) return { message: 'Email already verified', alreadyVerified: true };
  // Demo flow: no mailer configured, so flip immediately and note it.
  await store.updateUser(user.id, { isVerified: true });
  return { message: 'Email verified' };
}

async function forgotPassword(emailAddress) {
  const store = getDriver();
  const user = await store.findUserByEmail(emailAddress);
  // Always respond the same to avoid account enumeration.
  if (!user) return { message: 'If an account exists, a reset link has been sent.' };
  const token = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + 15 * 60 * 1000);
  await store.updateUser(user.id, { resetToken: token, resetTokenExpiry: expiry });
  return { message: 'If an account exists, a reset link has been sent.' };
}

async function resetPassword({ token, password }) {
  const store = getDriver();
  const user = await store.findUserByResetToken(token);
  if (!user) throw AppError.badRequest('This reset link is invalid or has expired');
  // eslint-disable-next-line global-require
  const bcrypt = require('bcryptjs');
  const passwordHash = await bcrypt.hash(password, 10);
  await store.updateUser(user.id, { passwordHash, resetToken: null, resetTokenExpiry: null });
  return { message: 'Password updated. You can now sign in.' };
}

module.exports = { buildAuthPayload, checkDomain, register, login, getMe, switchOrg, verifyEmail, forgotPassword, resetPassword, dashboardTypeFor, ORG_DASHBOARD_ROLES, RESEND_COOLDOWN_MS };
