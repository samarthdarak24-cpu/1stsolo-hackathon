const { asyncHandler, AppError } = require('../utils/errors');
const { uploadImage, assertRealImage, toPublicUrl, fileBuffer } = require('../middleware/upload');
const aiService = require('../services/aiItemService');
const { requireActiveOrg } = require('../services/orgContext');

/**
 * POST /api/ai/analyze-item — upload one image, return a structured item profile.
 * Used by the multi-step Report Lost / Report Found flow (step 2: AI item scan).
 */
const analyzeItem = asyncHandler(async (req, res) => {
  await requireActiveOrg(req);
  const file = req.file;
  if (!file) throw AppError.badRequest('Attach an image file under the "image" field');

  const { mime } = assertRealImage(file);
  const analysis = await aiService.analyzeImage({
    buffer: fileBuffer(file),
    mimetype: mime,
    filename: file.originalname,
    type: req.body.type === 'FOUND' ? 'FOUND' : 'LOST',
    // Optional user-supplied context (they may already know the category/brand).
    hints: req.body.hints ? safeParse(req.body.hints) : undefined
  });

  res.json({
    message: 'Item analysed',
    imageUrl: toPublicUrl(file),
    filename: file.originalname,
    analysis: {
      provider: analysis.provider,
      model: analysis.model || null,
      confidence: analysis.confidence,
      width: analysis.width,
      height: analysis.height,
      aspectRatio: analysis.aspectRatio,
      brightness: analysis.brightness,
      format: analysis.format,
      detectionProvider: analysis.detectionProvider || null,
      ocrProvider: analysis.ocrProvider || null,
      detections: analysis.detections || []
    },
    itemProfile: analysis.itemProfile,
    aiFields: analysis.itemProfile.aiFields,
    notice: analysis.notice || describeProvider(analysis.provider)
  });
});

/** Plain-language statement of which pipeline produced the attributes. */
function describeProvider(provider) {
  if (provider === 'inference-service') {
    return 'Attributes were produced by the local inference service (object detection + OCR). Review and correct any field before submitting.';
  }
  if (provider === 'vision') {
    return 'Attributes were produced by the configured vision model. Review and correct any field before submitting.';
  }
  return 'No vision model is configured, so these attributes come from image metadata. Add the details you know before submitting.';
}

/** GET /api/ai/provider — tells the UI which analysis backend is active. */
const provider = asyncHandler(async (req, res) => res.json(await aiService.providerInfo()));

/** Parses an optional JSON hints field; a malformed value is simply ignored. */
function safeParse(value) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return undefined;
  }
}

module.exports = { analyzeItem, provider };
