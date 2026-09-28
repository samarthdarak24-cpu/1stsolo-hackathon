/**
 * Organization service — org CRUD, membership, join/leave, settings, invites.
 * All access is checked against the caller's active-organization membership.
 */
const { getDriver } = require('../store');
const { AppError } = require('../utils/errors');
const { audit } = require('./auditService');
const notifications = require('./notificationService');
const realtime = require('../realtime/events');
const { requireActiveOrg, assertPermission, assertSameOrg, isManager } = require('./orgContext');

const DEFAULT_SETTINGS = {
  pickupLocation: 'Security Desk',
  instructions: 'Present your one-time QR code and confirm your identity.',
  matchThreshold: 35,
  highConfidence: 85,
  requireVerification: true,
  allowCctvRequests: false,
  matchAlerts: true,
  verificationAlerts: true,
  returnAlerts: true
};

const publicOrg = (org) => ({
  id: org.id,
  name: org.name,
  type: org.type,
  emailDomains: org.emailDomains || [],
  verifiedDomains: org.verifiedDomains || [],
  location: org.location || '',
  logoUrl: org.logoUrl || '',
  inviteCode: org.inviteCode,
  verificationStatus: org.verificationStatus,
  settings: { ...DEFAULT_SETTINGS, ...(org.settings || {}) },
  createdAt: org.createdAt
});

async function createOrganization(req, body) {
  const store = getDriver();
  const { extractDomain } = require('../middleware/auth');
  const domain = body.emailDomain ? String(body.emailDomain).toLowerCase().replace(/^@/, '') : extractDomain(req.user.email);
  if (domain) {
    const clash = await store.findOrgByDomain(domain);
    if (clash) throw AppError.conflict('An organization already uses that email domain');
  }
  const org = await store.createOrg({
    name: body.name,
    type: body.type,
    emailDomain: domain,
    location: body.location,
    logoUrl: body.logoUrl || '',
    ownerId: req.user.id,
    settings: DEFAULT_SETTINGS
  });
  await store.addMembership(req.user.id, org.id, 'owner');
  // Auto-verify the org owner — in a hackathon/demo the 2-step wizard itself
  // is sufficient proof; a production build would send an email instead.
  if (!req.user.isVerified) {
    await store.updateUser(req.user.id, { isVerified: true });
  }
  const updated = await store.findUserById(req.user.id);
  // Return a full auth payload so the frontend can navigate to the org dashboard
  // in a single round-trip without calling /api/auth/me again.
  const { buildAuthPayload } = require('./authService');
  const payload = await buildAuthPayload(updated);
  return { ...payload, organization: publicOrg(org), message: 'Organization created' };
}

async function listMyOrganizations(req) {
  const store = getDriver();
  const out = [];
  for (const m of req.user.memberships || []) {
    // eslint-disable-next-line no-await-in-loop
    const org = await store.findOrgById(m.orgId);
    if (org) {
      out.push({ ...publicOrg(org), role: m.role, joinedAt: m.joinedAt, active: m.orgId === req.user.activeOrgId });
    }
  }
  return { organizations: out, activeOrgId: req.user.activeOrgId };
}

async function getOrganization(req, id) {
  const store = getDriver();
  assertSameOrg({ orgId: req.user.activeOrgId }, id);
  const org = await store.findOrgById(id);
  if (!org) throw AppError.notFound('Organization not found');
  const members = await store.listMembers(org.id);
  return { organization: publicOrg(org), members };
}

async function updateOrganization(req, id, body) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertSameOrg(ctx, id);
  assertPermission(ctx, 'org:settings');
  const org = await store.updateOrg(id, body);
  await audit(req, { organizationId: id, action: 'ORG_UPDATED', entityType: 'ORGANIZATION', entityId: id, metadata: { fields: Object.keys(body) } });
  return { organization: publicOrg(org), message: 'Organization updated' };
}

async function joinOrganization(req, code) {
  const store = getDriver();
  const org = await store.findOrgByInviteCode(code);
  if (!org) throw AppError.badRequest('That invite code is not valid');
  const already = (req.user.memberships || []).some(m => m.orgId === org.id);
  if (!already) await store.addMembership(req.user.id, org.id, 'member');
  return { organization: publicOrg(org), joined: !already, message: already ? 'You are already a member' : `Joined ${org.name}` };
}

async function setActiveOrganization(req, orgId) {
  const store = getDriver();
  const mem = (req.user.memberships || []).find(m => m.orgId === orgId);
  if (!mem) throw AppError.forbidden('You are not a member of that organization');
  const updated = await store.updateUser(req.user.id, { activeOrgId: orgId });
  await audit(req, { organizationId: orgId, action: 'ORG_SWITCHED', entityType: 'ORGANIZATION', entityId: orgId, metadata: {} });
  return { user: updated, activeOrgId: orgId };
}

async function getSettings(req, id) {
  const ctx = await requireActiveOrg(req);
  assertSameOrg(ctx, id);
  return { settings: { ...DEFAULT_SETTINGS, ...(ctx.org.settings || {}) }, organization: publicOrg(ctx.org) };
}

async function updateSettings(req, id, body) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertSameOrg(ctx, id);
  assertPermission(ctx, 'org:settings');
  const merged = { ...DEFAULT_SETTINGS, ...(ctx.org.settings || {}), ...body };
  const org = await store.updateOrg(id, { settings: merged });
  await audit(req, { organizationId: id, action: 'ORG_SETTINGS_UPDATED', entityType: 'ORGANIZATION', entityId: id, metadata: { fields: Object.keys(body) } });
  // Settings gate what every member's UI offers (alerts, verification rules,
  // camera requests) — push the change so open screens re-read them live.
  realtime.publish(id, { type: 'ORGANIZATION', payload: { action: 'settings-updated', organizationId: id } });
  return { settings: merged, organization: publicOrg(org), message: 'Settings saved' };
}

async function listUsers(req, id) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertSameOrg(ctx, id);
  assertPermission(ctx, 'org:members');
  const members = await store.listMembers(ctx.orgId);
  return { users: members, total: members.length };
}

async function updateUserRole(req, id, userId, role) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertSameOrg(ctx, id);
  assertPermission(ctx, 'org:members');
  if (String(userId) === String(req.user.id)) throw AppError.badRequest('You cannot change your own role');
  if (role === 'owner') throw AppError.badRequest('Ownership transfer is not supported here');
  const updated = await store.setMembershipRole(userId, ctx.orgId, role);
  if (!updated) throw AppError.notFound('That member is not part of this organization');
  await notifications.notify(userId, ctx.orgId, {
    type: notifications.TYPE.ORGANIZATION,
    title: 'Your role was updated',
    message: `You now have the ${role} role in ${ctx.org.name}.`,
    referenceId: ctx.orgId,
    referenceType: 'ORGANIZATION'
  });
  await audit(req, { organizationId: ctx.orgId, action: 'ORG_MEMBER_ROLE_CHANGED', entityType: 'USER', entityId: userId, metadata: { role } });
  // Every open screen in the org re-reads the member list and permissions.
  realtime.publish(ctx.orgId, { type: 'ORGANIZATION', payload: { action: 'role-changed', userId, role } });
  return { user: { id: updated.id, name: updated.name, email: updated.email }, message: 'Role updated' };
}

async function inviteUser(req, id, body) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  assertSameOrg(ctx, id);
  assertPermission(ctx, 'org:invite');

  const invitee = await store.findUserByEmail(body.email);
  if (!invitee) {
    // No mailer configured: record the intent so the admin knows it is pending.
    await audit(req, { organizationId: ctx.orgId, action: 'ORG_INVITE_SENT', entityType: 'ORGANIZATION', entityId: ctx.orgId, metadata: { email: body.email, role: body.role || 'member', delivered: false } });
    return { message: `An invitation to ${body.email} has been recorded. They can join with code ${ctx.org.inviteCode}.`, pending: true, inviteCode: ctx.org.inviteCode };
  }

  const existing = (invitee.memberships || []).some(m => m.orgId === ctx.orgId);
  if (!existing) await store.addMembership(invitee.id, ctx.orgId, body.role || 'member', { activate: false });

  await notifications.notify(invitee.id, ctx.orgId, {
    type: notifications.TYPE.ORGANIZATION,
    title: `You were added to ${ctx.org.name}`,
    message: `You now have access to ${ctx.org.name} as ${body.role || 'member'}.`,
    referenceId: ctx.orgId,
    referenceType: 'ORGANIZATION'
  });
  await audit(req, { organizationId: ctx.orgId, action: 'ORG_MEMBER_ADDED', entityType: 'USER', entityId: invitee.id, metadata: { email: body.email, role: body.role || 'member' } });
  realtime.publish(ctx.orgId, { type: 'ORGANIZATION', payload: { action: 'member-added', userId: invitee.id } });
  return { message: `${invitee.name} was added to ${ctx.org.name}`, user: { id: invitee.id, name: invitee.name, email: invitee.email } };
}

const canManage = isManager;

module.exports = {
  publicOrg, DEFAULT_SETTINGS, createOrganization, listMyOrganizations, getOrganization,
  updateOrganization, joinOrganization, setActiveOrganization, getSettings, updateSettings,
  listUsers, updateUserRole, inviteUser, canManage
};
