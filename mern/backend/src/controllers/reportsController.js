const { asyncHandler } = require('../utils/errors');
const reportService = require('../services/reportService');
const { getDriver } = require('../store');
const { requireActiveOrg } = require('../services/orgContext');
const { AppError } = require('../utils/errors');

const createLostReport = asyncHandler(async (req, res) => {
  const result = await reportService.createReport(req, 'LOST');
  res.status(201).json({ message: result.message, report: result.report, organizationId: result.organizationId });
});

const createFoundReport = asyncHandler(async (req, res) => {
  const result = await reportService.createReport(req, 'FOUND');
  res.status(201).json({ message: result.message, report: result.report, organizationId: result.organizationId });
});

const listReports = asyncHandler(async (req, res) => res.json(await reportService.listReports(req, req.validatedQuery || req.query)));
const getReportById = asyncHandler(async (req, res) => res.json(await reportService.getReport(req, req.params.id)));
const updateReport = asyncHandler(async (req, res) => res.json(await reportService.updateReport(req, req.params.id, req.body)));

/**
 * POST /api/reports/:id/image — attach a photo the user chose themselves.
 * The multipart file is read by the upload middleware; the service decides
 * whether this caller may attach it to THIS report (and deletes it if not).
 */
const addReportImage = asyncHandler(async (req, res) =>
  res.json(await reportService.addReportImage(req, req.params.id, req.file)));

/** DELETE /api/reports/:id/image — detach one photo from the item. */
const removeReportImage = asyncHandler(async (req, res) =>
  res.json(await reportService.removeReportImage(req, req.params.id, req.body?.url)));

const deleteReport = asyncHandler(async (req, res) => res.json(await reportService.deleteReport(req, req.params.id)));

/** GET /api/reports/:id/timeline — status history as a display timeline. */
const getReportTimeline = asyncHandler(async (req, res) => {
  const data = await reportService.getReport(req, req.params.id);
  res.json({ reportId: data.report.id, status: data.report.status, timeline: reportService.buildTimeline(data.report) });
});

/** POST /api/reports/rematch — re-run matching for a report (staff or owner). */
const rematch = asyncHandler(async (req, res) => {
  const ctx = await requireActiveOrg(req);
  const report = await reportService.getReport(req, req.params.id);
  if (!report.canManage) throw AppError.forbidden('You cannot re-run matching for this report');

  // Refresh the embeddings first so the re-run uses current model output rather
  // than the vectors (or lack of them) from when the report was created.
  try {
    await reportService.generateEmbeddings(report.report);
  } catch (err) {
    console.warn(`[rematch] embedding refresh failed for ${report.report.reference}: ${err.message}`);
  }

  // eslint-disable-next-line global-require
  const matching = require('../services/matchingService');
  const created = await matching.findMatchesForReport(report.report.id);
  res.json({ message: `Matching re-run. ${created.length} new candidate(s) found.`, newMatches: created.length, organizationId: ctx.orgId });
});

module.exports = { createLostReport, createFoundReport, listReports, getReportById, updateReport, addReportImage, removeReportImage, deleteReport, getReportTimeline, rematch };
