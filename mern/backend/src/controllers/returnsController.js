const { asyncHandler } = require('../utils/errors');
const returnService = require('../services/returnService');

const createReturnAuthorization = asyncHandler(async (req, res) => {
  const result = await returnService.authorizeReturn(req, req.params.reportId, req.body);
  res.status(201).json(result);
});

const listReturns = asyncHandler(async (req, res) => res.json(await returnService.listReturns(req, req.validatedQuery || req.query)));
const getReturnById = asyncHandler(async (req, res) => res.json(await returnService.getReturnQr(req, req.params.id)));
const scanQrCode = asyncHandler(async (req, res) => res.json(await returnService.scanAndComplete(req, req.params.id, req.body)));
const refreshQr = asyncHandler(async (req, res) => res.json(await returnService.refreshQr(req, req.params.id)));

module.exports = { createReturnAuthorization, listReturns, getReturnById, scanQrCode, refreshQr };
