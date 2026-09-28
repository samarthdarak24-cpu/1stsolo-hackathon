const { asyncHandler } = require('../utils/errors');
const authService = require('../services/authService');

const checkDomain = asyncHandler(async (req, res) => res.json(await authService.checkDomain(req.body.email)));
const register = asyncHandler(async (req, res) => res.status(201).json(await authService.register(req.body)));
const login = asyncHandler(async (req, res) => res.json(await authService.login(req.body)));
const getMe = asyncHandler(async (req, res) => res.json(await authService.getMe(req)));
const switchOrg = asyncHandler(async (req, res) => res.json(await authService.switchOrg(req, req.body.orgId)));
const verifyEmail = asyncHandler(async (req, res) => res.json(await authService.verifyEmail(req.body.email)));
const forgotPassword = asyncHandler(async (req, res) => res.json(await authService.forgotPassword(req.body.email)));
const resetPassword = asyncHandler(async (req, res) => res.json(await authService.resetPassword(req.body)));

module.exports = { checkDomain, register, login, getMe, switchOrg, verifyEmail, forgotPassword, resetPassword };
