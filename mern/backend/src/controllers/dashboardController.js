const { asyncHandler } = require('../utils/errors');
const dashboardService = require('../services/dashboardService');
const profileService = require('../services/profileService');
const { getDriver } = require('../store');
const { AppError } = require('../utils/errors');
const { requireActiveOrg } = require('../services/orgContext');

/** GET /api/dashboard — everything the user dashboard home needs, in one call. */
const getUserDashboard = asyncHandler(async (req, res) => {
  const period = (req.validatedQuery || req.query).period || '30d';
  res.json(await dashboardService.getUserDashboard(req, { period }));
});

/** GET /api/dashboard/unread — lightweight poll for the topbar bell. */
const getUnread = asyncHandler(async (req, res) => res.json(await dashboardService.getUnreadCount(req)));

/** GET /api/profile */
const getProfile = asyncHandler(async (req, res) => res.json(await profileService.getProfile(req)));
/** PATCH /api/profile */
const updateProfile = asyncHandler(async (req, res) => res.json(await profileService.updateProfile(req, req.body)));
/** POST /api/profile/avatar — multipart; the file is the body (`uploadImage`). */
const uploadAvatar = asyncHandler(async (req, res) => res.json(await profileService.setAvatar(req, req.file)));
/** POST /api/profile/password */
const changePassword = asyncHandler(async (req, res) => res.json(await profileService.changePassword(req, req.body)));

/** GET /api/search?q=… — org-scoped search over reports + matches. */
const search = asyncHandler(async (req, res) => {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  const { q, limit = 8 } = req.validatedQuery || req.query;
  if (!q || String(q).trim().length < 2) return res.json({ query: q, lostReports: [], foundReports: [], matches: [] });
  const results = await store.search(ctx.orgId, String(q).trim(), { limit });
  return res.json({ query: q, ...results });
});

/**
 * GET /api/directory — id -> display name for members of the ACTIVE organization.
 * Lets the UI label "reported by Samarth Patil" without exposing other tenants'
 * user records or any private fields.
 */
const getDirectory = asyncHandler(async (req, res) => {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  const members = await store.listMembers(ctx.orgId);
  res.json({
    members: members.map(m => ({
      id: m.id,
      name: m.name,
      role: m.role,
      avatarUrl: m.avatarUrl || '',
      isVerified: m.isVerified,
      joinedAt: m.joinedAt
    }))
  });
});

module.exports = { getUserDashboard, getUnread, getProfile, updateProfile, uploadAvatar, changePassword, search, getDirectory };
