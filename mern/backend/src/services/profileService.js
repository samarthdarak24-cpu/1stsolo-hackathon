/**
 * Profile service — the signed-in user's own profile, memberships and settings.
 * A user can only ever read or write their own profile.
 */
const { getDriver } = require('../store');
const { AppError } = require('../utils/errors');
const { audit } = require('./auditService');
const { PERMISSIONS } = require('./orgContext');
const { assertRealImage, toPublicUrl, discardFile } = require('../middleware/upload');

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  avatarUrl: user.avatarUrl || '',
  bio: user.bio || '',
  isVerified: user.isVerified,
  createdAt: user.createdAt,
  activeOrgId: user.activeOrgId,
  preferences: {
    matchAlerts: true,
    verificationAlerts: true,
    returnAlerts: true,
    emailAlerts: true,
    shareLocation: true,
    cctvConsent: false,
    ...(user.preferences || {})
  }
});

async function getProfile(req) {
  const store = getDriver();
  const user = req.user;

  const orgs = [];
  for (const membership of user.memberships || []) {
    // eslint-disable-next-line no-await-in-loop
    const org = await store.findOrgById(membership.orgId);
    if (!org) continue;
    orgs.push({
      id: org.id,
      name: org.name,
      type: org.type,
      location: org.location,
      logoUrl: org.logoUrl,
      role: membership.role,
      permissions: PERMISSIONS[membership.role] || [],
      joinedAt: membership.joinedAt,
      active: membership.orgId === user.activeOrgId
    });
  }

  return {
    user: publicUser(user),
    organizations: orgs,
    sessions: (user.sessions || []).map(s => ({
      id: s.id, device: s.device, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, current: s.current
    })),
    security: {
      isVerified: user.isVerified,
      passwordSet: Boolean(user.passwordHash),
      twoFactorEnabled: false
    }
  };
}

const EDITABLE = ['name', 'phone', 'bio', 'avatarUrl'];
const PREFERENCE_KEYS = ['matchAlerts', 'verificationAlerts', 'returnAlerts', 'emailAlerts', 'shareLocation', 'cctvConsent'];

async function updateProfile(req, body) {
  const store = getDriver();
  const patch = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2) throw AppError.badRequest('Name must be at least 2 characters');
    patch.name = name;
  }
  if (body.phone !== undefined) patch.phone = String(body.phone).trim().slice(0, 32);
  if (body.bio !== undefined) patch.bio = String(body.bio).slice(0, 500);
  if (body.avatarUrl !== undefined) patch.avatarUrl = String(body.avatarUrl).slice(0, 2000);

  if (body.preferences) {
    const current = req.user.preferences || {};
    const next = { ...current };
    for (const key of PREFERENCE_KEYS) {
      if (body.preferences[key] !== undefined) next[key] = Boolean(body.preferences[key]);
    }
    patch.preferences = next;
  }

  if (!Object.keys(patch).length) throw AppError.badRequest('Nothing to update');

  const updated = await store.updateUser(req.user.id, patch);
  if (!updated) throw AppError.notFound('User not found');

  if (req.user.activeOrgId) {
    await audit(req, {
      organizationId: req.user.activeOrgId,
      action: 'PROFILE_UPDATED',
      entityType: 'USER',
      entityId: req.user.id,
      metadata: { fields: Object.keys(patch) }
    });
  }

  return { user: publicUser(updated), message: 'Profile updated' };
}

/**
 * POST /api/profile/avatar — a photo the user picked, stored like any other
 * upload.
 *
 * The profile form used to take a pasted image URL, which meant the only people
 * with an avatar were the ones who happened to host an image somewhere. This
 * route reuses the disk/S3 engine the report photos already use, so the
 * magic-byte check, the /uploads mount and the S3 swap are all inherited rather
 * than reimplemented. Multer has already written the file before we get here,
 * so every failure path has to remove it again.
 */
async function setAvatar(req, file) {
  if (!file) throw AppError.badRequest('Attach an image file under the "image" field');

  let url;
  try {
    // Sniffs the bytes and unlinks the file itself when it is not a real image.
    assertRealImage(file);
    url = toPublicUrl(file);
  } catch (err) {
    discardFile(file);
    throw err;
  }

  const store = getDriver();
  const updated = await store.updateUser(req.user.id, { avatarUrl: url });
  if (!updated) {
    discardFile(file);
    throw AppError.notFound('User not found');
  }

  if (req.user.activeOrgId) {
    await audit(req, {
      organizationId: req.user.activeOrgId,
      action: 'PROFILE_AVATAR_UPDATED',
      entityType: 'USER',
      entityId: req.user.id,
      metadata: { avatarUrl: url }
    });
  }

  // The previous file on disk is deliberately left alone: seeded demo avatars
  // are shared between accounts, the same reason report photos are never
  // unlinked on removal.
  return { message: 'Avatar updated', avatarUrl: url, user: publicUser(updated) };
}

async function changePassword(req, body) {
  const store = getDriver();
  // eslint-disable-next-line global-require
  const bcrypt = require('bcryptjs');

  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  if (newPassword.length < 8) throw AppError.badRequest('New password must be at least 8 characters');

  const user = await store.findUserById(req.user.id);
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw AppError.badRequest('Current password is incorrect');

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await store.updateUser(req.user.id, { passwordHash, resetToken: null, resetTokenExpiry: null });

  if (req.user.activeOrgId) {
    await audit(req, {
      organizationId: req.user.activeOrgId,
      action: 'PASSWORD_CHANGED',
      entityType: 'USER',
      entityId: req.user.id,
      metadata: {}
    });
  }

  return { message: 'Password updated' };
}

module.exports = { getProfile, updateProfile, setAvatar, changePassword, publicUser };
