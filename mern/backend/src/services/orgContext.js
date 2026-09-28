/**
 * Organization + role context resolution.
 *
 * Every request runs through here: authenticate -> resolve active org ->
 * verify membership -> resolve role/permissions. The organization id is NEVER
 * read from a client payload; it always comes from the authenticated user.
 */
const { getDriver } = require('../store');
const { AppError } = require('../utils/errors');

const ROLE_RANK = { member: 1, staff: 2, security: 2, admin: 3, owner: 4 };

/** Role capabilities. `member` is the baseline for every signed-in user. */
const PERMISSIONS = {
  member: [
    'report:create', 'report:view-own', 'match:view', 'verification:answer',
    'return:view-own', 'return:use-qr', 'profile:edit', 'notification:view'
  ],
  staff: [
    'report:create', 'report:view-own', 'report:view-all', 'report:update-status',
    'match:view', 'match:review', 'verification:answer', 'verification:review',
    'return:view-own', 'return:view-all', 'return:authorize', 'return:complete',
    'custody:view', 'profile:edit', 'notification:view'
  ],
  security: [
    'report:create', 'report:view-all', 'match:view', 'verification:view',
    'return:view-all', 'return:authorize', 'return:complete', 'custody:view',
    'profile:edit', 'notification:view'
  ],
  admin: [
    'report:create', 'report:view-own', 'report:view-all', 'report:update-status',
    'match:view', 'match:review', 'verification:answer', 'verification:review',
    'return:view-own', 'return:view-all', 'return:authorize', 'return:complete',
    'custody:view', 'analytics:view-org', 'audit:view', 'org:settings', 'org:members',
    'org:invite', 'profile:edit', 'notification:view'
  ],
  owner: [
    'report:create', 'report:view-own', 'report:view-all', 'report:update-status',
    'match:view', 'match:review', 'verification:answer', 'verification:review',
    'return:view-own', 'return:view-all', 'return:authorize', 'return:complete',
    'custody:view', 'analytics:view-org', 'audit:view', 'org:settings', 'org:members',
    'org:invite', 'org:transfer', 'profile:edit', 'notification:view'
  ]
};

/**
 * Resolves the active organization for the authenticated user.
 * Throws 400 when the user has no active org and 403 when membership is missing.
 */
async function requireActiveOrg(req) {
  const store = getDriver();
  const orgId = req.user?.activeOrgId;
  if (!orgId) {
    throw AppError.badRequest('No active organization. Switch or join an organization to continue.');
  }

  const membership = (req.user.memberships || []).find(m => m.orgId === orgId);
  if (!membership) {
    throw AppError.forbidden('You are not a member of the active organization');
  }

  const org = await store.findOrgById(orgId);
  if (!org) {
    throw AppError.badRequest('Active organization is unavailable. Contact your administrator.');
  }

  return { org, orgId, role: membership.role, membership };
}

/** Asserts the active-org user holds a permission. */
function assertPermission(ctx, permission) {
  const granted = PERMISSIONS[ctx.role] || [];
  if (!granted.includes(permission)) {
    throw AppError.forbidden(`Your role (${ctx.role}) cannot perform this action`);
  }
}

/** Asserts the active-org user holds any one of the listed permissions. */
function assertAnyPermission(ctx, permissions) {
  const granted = PERMISSIONS[ctx.role] || [];
  if (!permissions.some(p => granted.includes(p))) {
    throw AppError.forbidden(`Your role (${ctx.role}) cannot perform this action`);
  }
}

/** Asserts a path-parameter org id matches the active organization. */
function assertSameOrg(ctx, requestedOrgId) {
  if (String(requestedOrgId) !== String(ctx.orgId)) {
    throw AppError.forbidden('You can only access your active organization');
  }
}

/** Staff-level roles that may see every report in the organization. */
const isStaff = (role) => ['staff', 'security', 'admin', 'owner'].includes(role);
const isManager = (role) => ['admin', 'owner'].includes(role);
const atLeast = (role, minimum) => (ROLE_RANK[role] || 0) >= (ROLE_RANK[minimum] || 99);

module.exports = {
  PERMISSIONS,
  requireActiveOrg,
  assertPermission,
  assertAnyPermission,
  assertSameOrg,
  isStaff,
  isManager,
  atLeast
};
