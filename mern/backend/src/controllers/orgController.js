const { asyncHandler } = require('../utils/errors');
const orgService = require('../services/organizationService');

const createOrganization = asyncHandler(async (req, res) => res.status(201).json(await orgService.createOrganization(req, req.body)));
const listMyOrganizations = asyncHandler(async (req, res) => res.json(await orgService.listMyOrganizations(req)));
const getOrganization = asyncHandler(async (req, res) => res.json(await orgService.getOrganization(req, req.params.id)));
const updateOrganization = asyncHandler(async (req, res) => res.json(await orgService.updateOrganization(req, req.params.id, req.body)));
const joinOrganization = asyncHandler(async (req, res) => res.json(await orgService.joinOrganization(req, req.body.inviteCode)));
const setActiveOrganization = asyncHandler(async (req, res) => res.json(await orgService.setActiveOrganization(req, req.body.orgId)));

const getSettings = asyncHandler(async (req, res) => res.json(await orgService.getSettings(req, req.params.id)));
const updateSettings = asyncHandler(async (req, res) => res.json(await orgService.updateSettings(req, req.params.id, req.body)));
const listUsers = asyncHandler(async (req, res) => res.json(await orgService.listUsers(req, req.params.id)));
const updateUserRole = asyncHandler(async (req, res) => res.json(await orgService.updateUserRole(req, req.params.id, req.params.userId, req.body.role)));
const inviteUser = asyncHandler(async (req, res) => res.json(await orgService.inviteUser(req, req.params.id, req.body)));

module.exports = {
  createOrganization, listMyOrganizations, getOrganization, updateOrganization,
  joinOrganization, setActiveOrganization, getSettings, updateSettings, listUsers,
  updateUserRole, inviteUser
};
