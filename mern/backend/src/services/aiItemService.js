/**
 * AI item analysis service.
 *
 * Two providers:
 *  1. `vision`   — a real VLM call (OpenAI-compatible vision endpoint) used when
 *                   AI_VISION_API_KEY is configured. Returns structured JSON.
 *  2. `heuristic`— offline fallback that does genuine image parsing (real pixel
 *                   dimensions from PNG/JPEG headers, sampled dominant colour,
 *                   luminance/aspect statistics) plus filename hints. It does NOT
 *                   claim to do object detection or OCR.
 *
 * Every field the analysis produced is tagged in `aiFields` so the UI can show
 * which values are AI-derived and let the user correct them.
 */
const config = require('../config');

const CATEGORY_HINTS = [
  { category: 'Backpack', rx: /back\s?pack|rucksack|daypack|schoolbag/i },
  { category: 'Handbag', rx: /hand\s?bag|purse|tote/i },
  { category: 'Water Bottle', rx: /bottle|flask|thermos|tumbler/i },
  { category: 'Laptop', rx: /laptop|notebook|macbook/i },
  { category: 'Phone', rx: /phone|mobile|iphone|android/i },
  { category: 'Headphones', rx: /headphone|earphone|airpods|headset/i },
  { category: 'Wallet', rx: /wallet|purse|card\s?holder/i },
  { category: 'Keys', rx: /key|keys|keyring/i },
  { category: 'Watch', rx: /watch|smartwatch|wristwatch/i },
  { category: 'Umbrella', rx: /umbrella/i },
  { category: 'Books', rx: /book|textbook|notebook|journal/i },
  { category: 'ID Card', rx: /id\s?card|badge|pass/i },
  { category: 'Glasses', rx: /glasses|sunglass|specs/i },
  { category: 'Charger', rx: /charger|adapter|cable|power\s?bank/i }
];

const COLOR_HINTS = [
  { color: 'Black', rx: /\bblack\b/i },
  { color: 'White', rx: /\bwhite\b/i },
  { color: 'Blue', rx: /\bblue\b|navy|indigo/i },
  { color: 'Red', rx: /\bred\b|maroon|crimson/i },
  { color: 'Green', rx: /\bgreen\b|olive/i },
  { color: 'Yellow', rx: /\byellow\b/i },
  { color: 'Orange', rx: /\borange\b/i },
  { color: 'Purple', rx: /\bpurple\b|violet|lavender/i },
  { color: 'Pink', rx: /\bpink\b|rose/i },
  { color: 'Grey', rx: /\bgr[ae]y\b|silver|charcoal/i },
  { color: 'Brown', rx: /\bbrown\b|beige|tan|khaki/i }
];

const shapeFromAspect = (w, h) => {
  if (!w || !h) return '';
  const ratio = w / h;
  if (ratio > 1.9) return 'Wide';
  if (ratio > 1.3) return 'Rectangular';
  if (ratio > 0.85 && ratio < 1.18) return 'Square';
  if (ratio < 0.55) return 'Tall';
  return 'Rounded';
};

/* ------------------------------------------------------------------ */
/* Binary image parsing (real, dependency-free)                        */
/* ------------------------------------------------------------------ */

/** Reads true pixel dimensions from PNG, JPEG, or WEBP headers. */
function readImageSize(buffer) {
  if (!buffer || buffer.length < 24) return { width: 0, height: 0, format: 'unknown' };

  // PNG: 8-byte signature, then IHDR width/height as uint32 BE.
  if (buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'png' };
  }

  // JPEG: walk the segment markers to the SOFn frame header.
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf
        && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7), format: 'jpeg' };
      }
      offset += 2 + length;
    }
    return { width: 0, height: 0, format: 'jpeg' };
  }

  // WEBP (RIFF container): VP8 / VP8L / VP8X variants.
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8 ' && buffer.length > 30) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff, format: 'webp' };
    }
    if (chunk === 'VP8L' && buffer.length > 25) {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, format: 'webp' };
    }
    if (chunk === 'VP8X' && buffer.length > 30) {
      return {
        width: (buffer.readUIntLE(24, 3) & 0xffffff) + 1,
        height: (buffer.readUIntLE(27, 3) & 0xffffff) + 1,
        format: 'webp'
      };
    }
  }

  return { width: 0, height: 0, format: 'unknown' };
}

const nearestColorName = ([r, g, b]) => {
  const table = [
    ['Black', [26, 26, 26]], ['White', [242, 242, 242]], ['Grey', [130, 130, 130]],
    ['Blue', [37, 78, 158]], ['Navy', [22, 34, 68]], ['Red', [178, 42, 42]],
    ['Orange', [214, 118, 32]], ['Yellow', [222, 190, 60]], ['Green', [46, 122, 62]],
    ['Purple', [104, 58, 148]], ['Pink', [214, 122, 168]], ['Brown', [112, 78, 52]],
    ['Beige', [214, 199, 170]]
  ];
  let best = table[0];
  let bestDist = Infinity;
  for (const entry of table) {
    const [cr, cg, cb] = entry[1];
    const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (dist < bestDist) { bestDist = dist; best = entry; }
  }
  return { name: best[0], distance: Math.round(Math.sqrt(bestDist)) };
};

/**
 * Samples the byte stream to approximate the dominant colour.
 * This is a coarse approximation (compressed data correlates with, but is not,
 * pixel colour) and is reported as low confidence.
 */
function sampleColor(buffer) {
  if (!buffer || buffer.length < 32) return null;
  const step = Math.max(1, Math.floor(buffer.length / 4000));
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let i = 16; i < buffer.length - 16; i += step) {
    r += buffer[i];
    g += buffer[i + 1];
    b += buffer[i + 2];
    n += 1;
  }
  if (!n) return null;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

const luminance = ([r, g, b]) => Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b));

/* ------------------------------------------------------------------ */
/* Providers                                                           */
/* ------------------------------------------------------------------ */

function heuristicProvider({ buffer, filename }) {
  const size = readImageSize(buffer);
  const rgb = sampleColor(buffer);
  const color = rgb ? nearestColorName(rgb) : null;
  const stem = String(filename || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ');

  const category = CATEGORY_HINTS.find(h => h.rx.test(stem))?.category || '';
  const colorHint = COLOR_HINTS.find(h => h.rx.test(stem))?.color || '';
  const brandHint = (stem.match(/\b(wildcraft|hp|dell|lenovo|apple|samsung|nike|adidas|reebok|boat|puma|amazon)\b/i) || [])[1];

  return {
    provider: 'heuristic',
    confidence: rgb && color && color.distance < 60 ? 0.45 : 0.25,
    width: size.width,
    height: size.height,
    format: size.format,
    aspectRatio: size.width && size.height ? Number((size.width / size.height).toFixed(2)) : null,
    dominantColor: color?.name || colorHint || '',
    colorDistance: color?.distance ?? null,
    sampledRgb: rgb,
    brightness: rgb ? luminance(rgb) : null,
    category,
    brand: brandHint ? brandHint[0].toUpperCase() + brandHint.slice(1).toLowerCase() : '',
    shape: shapeFromAspect(size.width, size.height),
    ocrText: ''
  };
}

const VISION_PROMPT = `You analyse a photo of a lost-and-found item.
Return ONLY JSON with these keys:
category, primaryColor, secondaryColor, brand, model, material, shape, visibleMark, size, condition, ocrText, confidence (0-1).
Use empty strings for anything you cannot see. ocrText must contain only text literally visible in the image.`;

async function visionProvider({ buffer, mimetype }) {
  const apiKey = process.env.AI_VISION_API_KEY;
  if (!apiKey) return null;

  const base = (process.env.AI_VISION_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.AI_VISION_MODEL || 'gpt-4o-mini';
  const dataUrl = `data:${mimetype};base64,${buffer.toString('base64')}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.AI_VISION_TIMEOUT_MS || 20000));

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: VISION_PROMPT },
          { role: 'user', content: [{ type: 'text', text: 'Analyse this item photo.' }, { type: 'image_url', image_url: { url: dataUrl } }] }
        ]
      })
    });

    if (!res.ok) throw new Error(`vision provider returned ${res.status}`);
    const payload = await res.json();
    const text = payload?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(text);
    const size = readImageSize(buffer);
    const rgb = sampleColor(buffer);

    return {
      provider: 'vision',
      model,
      confidence: Number(parsed.confidence) || 0.8,
      width: size.width,
      height: size.height,
      format: size.format,
      aspectRatio: size.width && size.height ? Number((size.width / size.height).toFixed(2)) : null,
      dominantColor: parsed.primaryColor || '',
      colorDistance: null,
      sampledRgb: rgb,
      brightness: rgb ? luminance(rgb) : null,
      category: parsed.category || '',
      primaryColor: parsed.primaryColor || '',
      secondaryColor: parsed.secondaryColor || '',
      brand: parsed.brand || '',
      model: parsed.model || '',
      material: parsed.material || '',
      shape: parsed.shape || shapeFromAspect(size.width, size.height),
      visibleMark: parsed.visibleMark || '',
      size: parsed.size || '',
      condition: parsed.condition || '',
      ocrText: parsed.ocrText || ''
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

const AI_FIELDS = [
  'category', 'primaryColor', 'secondaryColor', 'brand', 'model', 'material',
  'shape', 'visibleMark', 'size', 'condition', 'ocrText'
];

/**
 * Provider 1: the local Python inference service (YOLO26 detection, PaddleOCR,
 * optional Qwen3-VL understanding). This is the preferred path — it is the only
 * one that actually detects the object and reads text off it.
 * Returns null (never throws) when the service is disabled or unreachable, so
 * the caller can fall back without the report submit failing.
 */
async function inferenceServiceProvider({ buffer, filename, type, hints }) {
  // eslint-disable-next-line global-require
  const aiClient = require('./aiClient');
  const config = require('../config');
  if (!config.ai.enabled) return null;

  try {
    const health = await aiClient.health();
    if (health.status === 'unreachable') return null;

    const result = await aiClient.analyzeItem({
      imagePath: buffer,
      filename,
      reportType: type,
      hints
    });
    const profile = result.item_profile || result.itemProfile || {};
    const pixel = profile.pixelStats || {};
    const detections = Array.isArray(result.detections) ? result.detections : [];

    return {
      provider: 'inference-service',
      // Which models produced this analysis. NOT the item's model number -
      // `buildItemProfile` reads `itemModel` for that, and overloading `model`
      // previously wrote a string like "no-vlm:no-detection:paddleocr" into
      // every reported item's model field.
      analysisVersion: result.analysis_version || result.analysisVersion || null,
      model: profile.model || '',
      confidence: Number(result.confidence) || Number(profile.aiConfidence) || 0,
      width: result.width,
      height: result.height,
      format: null,
      aspectRatio: result.aspect_ratio ?? result.aspectRatio ?? null,
      dominantColor: profile.primaryColor || '',
      colorDistance: null,
      sampledRgb: null,
      brightness: typeof pixel.brightness === 'number' ? Math.round(pixel.brightness * 255) : null,
      category: profile.category || '',
      primaryColor: profile.primaryColor || '',
      secondaryColor: profile.secondaryColor || '',
      brand: profile.brand || '',
      itemModel: profile.model || '',
      material: profile.material || '',
      shape: profile.shape || '',
      visibleMark: profile.visibleMark || '',
      size: profile.size || '',
      condition: profile.condition || '',
      ocrText: result.ocr_text || result.ocrText || profile.ocrText || '',
      detections,
      notice: result.notice || '',
      // Real detection + OCR providers, surfaced so the UI can state what ran.
      detectionProvider: result.detection_provider || null,
      ocrProvider: result.ocr_provider || null
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[aiItem] inference service unavailable, falling back:', err.message);
    return null;
  }
}

/**
 * Analyses an uploaded image and merges the result with user-supplied hints.
 * Provider order: inference service -> OpenAI-compatible vision -> local heuristic.
 * Never throws: a report submission must not fail because a model server is down.
 */
async function analyzeImage({ buffer, mimetype, filename, type, hints }) {
  let result = await inferenceServiceProvider({ buffer, filename, type, hints });

  if (!result) {
    try {
      result = await visionProvider({ buffer, mimetype });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[aiItem] vision provider failed, using heuristic:', err.message);
      result = null;
    }
  }
  if (!result) {
    result = heuristicProvider({ buffer, filename });
    result.notice = result.notice
      || 'No vision model is configured, so these attributes come from image metadata and your filename. Add the details you know before submitting.';
  }

  const profile = buildItemProfile(result, { type });
  return {
    ...result,
    itemProfile: profile,
    analysisVersion: result.provider === 'inference-service'
      ? (result.model || 'inference-service')
      : result.provider === 'vision' ? `vision:${result.model}` : `heuristic:${config.env}`
  };
}

/** Turns a raw analysis into the structured item profile stored on a report. */
function buildItemProfile(analysis, { type } = {}) {
  const stemFields = {};
  if (type === 'FOUND') {
    stemFields.condition = analysis.condition || 'Good';
    stemFields.finderNotes = '';
  }

  return {
    itemName: analysis.category || '',
    category: analysis.category || '',
    primaryColor: analysis.primaryColor || analysis.dominantColor || '',
    secondaryColor: analysis.secondaryColor || '',
    brand: analysis.brand || '',
    model: analysis.itemModel || analysis.model || '',
    material: analysis.material || '',
    shape: analysis.shape || '',
    visibleMark: analysis.visibleMark || '',
    serialNumber: '',
    size: analysis.size || '',
    ocrText: analysis.ocrText || '',
    ...stemFields,
    estimatedValue: '',
    aiConfidence: analysis.confidence ?? 0,
    aiFields: AI_FIELDS.filter(f => (analysis[f] || analysis.mapped?.[f])),
    analysisVersion: analysis.analysisVersion || ''
  };
}

async function providerInfo() {
  // eslint-disable-next-line global-require
  const aiClient = require('./aiClient');
  const config = require('../config');
  if (config.ai.enabled) {
    const health = await aiClient.health();
    if (health.status !== 'unreachable') {
      const providers = Object.entries(health.providers || {}).map(([name, info]) => ({
        name,
        status: info?.status || 'unknown',
        model: info?.model || null
      }));
      return {
        visionConfigured: true,
        provider: 'inference-service',
        model: providers.find(p => p.name === 'detector')?.model || null,
        serviceStatus: health.status,
        device: health.device || null,
        vectorStore: health.vector_store || 'none',
        providers
      };
    }
  }
  return {
    visionConfigured: Boolean(process.env.AI_VISION_API_KEY),
    provider: process.env.AI_VISION_API_KEY ? 'vision' : 'heuristic',
    model: process.env.AI_VISION_MODEL || null,
    serviceStatus: 'unreachable',
    providers: []
  };
}

module.exports = { analyzeImage, buildItemProfile, readImageSize, sampleColor, heuristicProvider, providerInfo, AI_FIELDS };
