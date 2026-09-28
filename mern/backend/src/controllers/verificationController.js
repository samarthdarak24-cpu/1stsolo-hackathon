const { asyncHandler } = require('../utils/errors');
const verificationService = require('../services/verificationService');

const createVerification = asyncHandler(async (req, res) => {
  const result = await verificationService.startVerification(req, req.body.matchId);
  res.status(201).json(result);
});

const submitVerificationAnswer = asyncHandler(async (req, res) => res.json(await verificationService.submitAnswer(req, req.params.id, req.body)));
const reviewVerification = asyncHandler(async (req, res) => res.json(await verificationService.reviewVerification(req, req.params.id, req.body)));
const listVerifications = asyncHandler(async (req, res) => res.json(await verificationService.listVerifications(req, req.validatedQuery || req.query)));

module.exports = { createVerification, submitVerificationAnswer, reviewVerification, listVerifications };
