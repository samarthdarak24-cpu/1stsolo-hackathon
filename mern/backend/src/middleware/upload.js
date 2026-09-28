/**
 * Image upload middleware.
 *
 * Two storage engines behind one contract, chosen by `STORAGE_DRIVER`
 * (auto | disk | s3):
 *
 *   disk (default) - multer diskStorage into `uploads/`, served read-only from
 *                    /uploads. This is what a clone-and-run uses, and it needs
 *                    no dependencies or credentials.
 *   s3             - an S3-compatible bucket (AWS, MinIO, R2, Spaces) so a
 *                    deploy with an ephemeral filesystem does not lose photos on
 *                    the next release.
 *
 * The S3 engine needs `multer-s3` + `@aws-sdk/client-s3`, which are NOT hard
 * dependencies: they are loaded lazily and, when missing or unconfigured, the
 * module says so once and stays on disk. A misconfigured bucket must never turn
 * "report a lost item" into a 500.
 *
 * Callers only ever see three things - the multer middlewares, `assertRealImage`,
 * `toPublicUrl` - plus `fileBuffer`/`discardFile`, which exist because an S3
 * upload has no `file.path` to read or unlink.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const { AppError } = require('../utils/errors');

const UPLOAD_DIR = path.resolve(process.cwd(), config.uploads.dir);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

/** Confirms the declared mime type matches the file's magic bytes. */
function sniffMime(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const newName = (file) => {
  const ext = EXTENSION_BY_MIME[file.mimetype] || '.jpg';
  return `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`;
};

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, newName(file))
});

/* ---------------------------------------------------------------- s3 engine */

/**
 * Resolves the object-storage engine once, at module load. Returns null when
 * disk storage should be used, which is also the report a caller can read.
 */
function resolveStorage() {
  const requested = config.storage.driver;
  const bucket = config.storage.s3.bucket;

  if (requested === 'disk') return { engine: 'disk', configured: true, reason: 'STORAGE_DRIVER=disk' };
  if (requested !== 's3') {
    // auto: S3 only when a bucket is actually named.
    if (!bucket) return { engine: 'disk', configured: true, reason: 'no S3_BUCKET set - local disk' };
  }

  if (!bucket) return { engine: 'disk', configured: true, reason: 'STORAGE_DRIVER=s3 but S3_BUCKET is empty' };

  try {
    // eslint-disable-next-line global-require
    const multerS3 = require('multer-s3');
    // eslint-disable-next-line global-require
    const { S3Client } = require('@aws-sdk/client-s3');
    const client = new S3Client({
      region: config.storage.s3.region,
      // MinIO/R2/Spaces need an explicit endpoint; AWS must NOT get one.
      ...(config.storage.s3.endpoint ? { endpoint: config.storage.s3.endpoint, forcePathStyle: true } : {}),
      ...(config.storage.s3.accessKeyId
        ? { credentials: { accessKeyId: config.storage.s3.accessKeyId, secretAccessKey: config.storage.s3.secretAccessKey } }
        : {})
    });

    const engine = multerS3({
      s3: client,
      bucket,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      // Public-read: these are item photos the report UI renders directly. A
      // private bucket works too - set STORAGE_PUBLIC_BASE_URL to a CDN/reverse
      // proxy and grant read there instead.
      acl: config.storage.s3.publicRead ? 'public-read' : undefined,
      key: (req, file, cb) => cb(null, `${config.storage.s3.prefix}/${newName(file)}`)
    });

    return { engine: 's3', configured: true, reason: `S3 bucket ${bucket}`, s3: engine };
  } catch (err) {
    return {
      engine: 'disk',
      configured: true,
      reason: `S3 unavailable (${err.code === 'MODULE_NOT_FOUND' ? 'npm i multer-s3 @aws-sdk/client-s3' : err.message}) - using local disk`
    };
  }
}

const resolved = resolveStorage();
if (resolved.engine === 's3') {
  // eslint-disable-next-line no-console
  console.log(`[upload] object storage enabled - ${resolved.reason}`);
} else if (config.storage.driver === 's3' || config.storage.s3.bucket) {
  // Only announce the fallback when the operator actually asked for S3.
  // eslint-disable-next-line no-console
  console.warn(`[upload] object storage requested but not active - ${resolved.reason}`);
}

/** What the upload layer is really doing; surfaced on /api/health. */
const storageStatus = () => ({
  driver: resolved.engine,
  bucket: resolved.engine === 's3' ? config.storage.s3.bucket : null,
  publicBaseUrl: config.storage.publicBaseUrl || null,
  reason: resolved.reason
});

const upload = multer({
  storage: resolved.engine === 's3' ? resolved.s3 : diskStorage,
  limits: { fileSize: config.uploads.maxBytes, files: 6 },
  fileFilter: (req, file, cb) => {
    if (!config.uploads.allowedMime.includes(file.mimetype)) {
      return cb(new AppError(400, 'Only JPG, PNG and WebP images are supported'));
    }
    cb(null, true);
  }
});

const uploadImage = upload.single('image');
const uploadImages = upload.array('images', 6);

/**
 * Bytes of an uploaded file, whichever engine stored it.
 * The disk engine exposes `path`; the S3 engine keeps the bytes in `buffer`.
 */
function fileBuffer(file) {
  if (!file) return null;
  if (file.buffer) return file.buffer;
  if (file.path) return fs.readFileSync(file.path);
  return null;
}

/** Removes a stored file. A no-op for S3 here: the controller never claims it. */
function discardFile(file) {
  if (file?.path) fs.unlink(file.path, () => {});
}

/** Post-upload magic-byte check, run inside the controller wrapper. */
function assertRealImage(file) {
  if (!file) throw AppError.badRequest('No image was uploaded');
  const buffer = fileBuffer(file);
  const mime = sniffMime(buffer);
  if (!mime || !config.uploads.allowedMime.includes(mime)) {
    discardFile(file);
    throw AppError.badRequest('That file is not a valid image');
  }
  return { mime, size: file.size ?? buffer?.length ?? 0 };
}

/** Public URL for a stored file: S3 object URL when present, else /uploads. */
const toPublicUrl = (file) => {
  if (!file) return null;
  if (file.location) return file.location; // multer-s3
  if (file.key) {
    return config.storage.publicBaseUrl
      ? `${config.storage.publicBaseUrl}/${file.key}`
      : `/uploads/${String(file.key).split('/').pop()}`;
  }
  return `/uploads/${path.basename(file.path)}`;
};

module.exports = {
  uploadImage,
  uploadImages,
  assertRealImage,
  toPublicUrl,
  fileBuffer,
  discardFile,
  storageStatus,
  UPLOAD_DIR,
  sniffMime
};
