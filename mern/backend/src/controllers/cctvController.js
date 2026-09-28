const { asyncHandler } = require('../utils/errors');
const cctvService = require('../services/cctvService');

/** GET /api/cctv/status — honest capability report, never throws on outage. */
const status = asyncHandler(async (req, res) => res.json(await cctvService.status(req)));

/** POST /api/cctv/analyze — search one clip that exists on the analysis host. */
const analyze = asyncHandler(async (req, res) => res.json(await cctvService.analyze(req, req.body)));

/** GET /api/cctv/events/:reportId — recorded clip evidence for one item. */
const listEvents = asyncHandler(async (req, res) =>
  res.json(await cctvService.listEvents(req, req.params.reportId)));

module.exports = { status, analyze, listEvents };
