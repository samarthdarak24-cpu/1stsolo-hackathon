const { asyncHandler } = require('../utils/errors');
const orgService = require('../services/organizationService');

const getOrganizationSettings = asyncHandler(async (req, res) => res.json(await orgService.getSettings(req, req.params.id)));
const updateOrganizationSettings = asyncHandler(async (req, res) => res.json(await orgService.updateSettings(req, req.params.id, req.body)));
const listOrganizationUsers = asyncHandler(async (req, res) => res.json(await orgService.listUsers(req, req.params.id)));
const updateUserRole = asyncHandler(async (req, res) => res.json(await orgService.updateUserRole(req, req.params.id, req.params.userId, req.body.role)));
const inviteUser = asyncHandler(async (req, res) => res.json(await orgService.inviteUser(req, req.params.id, req.body)));

module.exports = { getOrganizationSettings, updateOrganizationSettings, listOrganizationUsers, updateUserRole, inviteUser };
