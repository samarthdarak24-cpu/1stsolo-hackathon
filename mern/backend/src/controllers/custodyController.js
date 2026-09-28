const { asyncHandler } = require('../utils/errors');
const custodyService = require('../services/custodyService');

/** GET /api/custody — organization-wide chain of custody rows. */
const listCustody = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  res.json(await custodyService.listCustody(req, query));
});

/** GET /api/custody/:id */
const getCustodyRecord = asyncHandler(async (req, res) =>
  res.json(await custodyService.getCustodyRecord(req, req.params.id)));

/** GET /api/reports/:id/custody — full trail for one item, oldest first. */
const getReportCustody = asyncHandler(async (req, res) =>
  res.json(await custodyService.getReportCustody(req, req.params.id)));

/** POST /api/reports/:id/custody — append a hand-over entry. */
const addCustodyRecord = asyncHandler(async (req, res) => {
  const result = await custodyService.addCustodyRecord(req, req.params.id, req.body);
  res.status(201).json(result);
});

/** GET /api/reports/:id/custody/verify — re-check the hash chain for one item. */
const verifyCustodyChain = asyncHandler(async (req, res) =>
  res.json(await custodyService.verifyCustodyChain(req, req.params.id)));

module.exports = { listCustody, getCustodyRecord, getReportCustody, addCustodyRecord, verifyCustodyChain };
