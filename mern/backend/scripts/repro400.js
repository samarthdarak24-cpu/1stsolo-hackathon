/**
 * Throwaway reproduction for the reporter's 400:
 *   "Invalid input: expected object, received null"
 *
 * It logs in, uploads a photo to /api/ai/analyze-item exactly like the Report
 * Lost wizard does, rebuilds the submit payload from the returned itemProfile,
 * and prints the server's answer for several shapes of the optional fields.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const BASE = process.env.REPRO_BASE || 'http://127.0.0.1:5000';

/** Minimal valid PNG (2x2, grey) so the magic-byte check passes. */
function tinyPng() {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 0;   // greyscale
  const raw = Buffer.from([0, 0x80, 0x80, 0, 0x80, 0x80]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}


async function json(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await json(res);
  if (!res.ok) throw new Error(`login ${res.status}: ${JSON.stringify(data)}`);
  return data.token;
}

async function analyze(token, filePath, type = 'LOST') {
  const bytes = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('image', new Blob([bytes], { type: 'image/jpeg' }), path.basename(filePath));
  form.append('type', type);
  const res = await fetch(`${BASE}/api/ai/analyze-item`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const data = await json(res);
  return { status: res.status, data, bytes };
}

async function postReport(token, payload) {
  const res = await fetch(`${BASE}/api/reports/lost`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const data = await json(res);
  return { status: res.status, data };
}

(async () => {
  const email = process.env.REPRO_EMAIL || 'student@abcschool.com';
  const password = process.env.REPRO_PASSWORD || 'lostlink123';
  const token = await login(email, password);
  console.log('login ok');

  const dir = path.resolve(process.cwd(), '..', '..', 'uploads');
  const candidates = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)) : [];
  let filePath;
  if (candidates.length) {
    filePath = path.join(dir, candidates[0]);
    console.log('using sample image:', candidates[0], fs.statSync(filePath).size, 'bytes');
  } else {
    filePath = path.join(require('os').tmpdir(), 'repro-sample.png');
    fs.writeFileSync(filePath, tinyPng());
    console.log('no sample images found; generated', filePath, fs.statSync(filePath).size, 'bytes');
  }

  const analysis = await analyze(token, filePath);
  console.log('\n--- POST /api/ai/analyze-item ---');
  console.log('status:', analysis.status);
  console.log('body:', JSON.stringify(analysis.data, null, 2).slice(0, 2500));

  const itemProfile = analysis.data.itemProfile || {};
  console.log('\nprofile field values (typeof):');
  Object.entries(itemProfile).forEach(([k, v]) => console.log(`  ${k}:`, v === null ? 'NULL' : typeof v, JSON.stringify(v)));

  // The wizard body, reconstructed from the scan response.
  const base = {
    itemProfile: {
      itemName: 'Backpack',
      category: itemProfile.category || 'Backpack',
      primaryColor: itemProfile.primaryColor || undefined,
      secondaryColor: itemProfile.secondaryColor || undefined,
      brand: itemProfile.brand || undefined,
      model: itemProfile.model || undefined,
      material: itemProfile.material || undefined,
      shape: itemProfile.shape || undefined,
      size: itemProfile.size || undefined,
      visibleMark: itemProfile.visibleMark || undefined,
      ocrText: itemProfile.ocrText || undefined,
      serialNumber: itemProfile.serialNumber || undefined
    },
    images: analysis.data.imageUrl ? [analysis.data.imageUrl] : [],
    description: 'Navy blue backpack with a laptop sleeve and a water bottle inside.',
    category: itemProfile.category || 'Backpack',
    location: 'Central Library, 2nd Floor',
    lostAt: new Date().toISOString()
  };

  console.log('\n--- case A: cleaned payload (|| undefined) ---');
  console.log(JSON.stringify(await postReport(token, base), null, 2));

  console.log('\n--- case B: raw spread of the scan profile (no || undefined) ---');
  const raw = { ...base, itemProfile: { ...itemProfile, itemName: 'Backpack', category: itemProfile.category || 'Backpack' } };
  console.log(JSON.stringify(await postReport(token, raw), null, 2));

  console.log('\n--- case C: itemProfile: null ---');
  console.log(JSON.stringify(await postReport(token, { ...base, itemProfile: null }), null, 2));

  console.log('\n--- case D: coordinates: null ---');
  console.log(JSON.stringify(await postReport(token, { ...base, coordinates: null }), null, 2));

  console.log('\n--- case E: ReportFound.jsx shape (raw profile + lat/lng null) ---');
  const foundShape = {
    itemProfile: {
      itemName: 'Backpack',
      category: itemProfile.category || 'Backpack',
      primaryColor: itemProfile.primaryColor,
      secondaryColor: itemProfile.secondaryColor,
      brand: itemProfile.brand,
      model: itemProfile.model,
      material: itemProfile.material,
      shape: itemProfile.shape,
      size: itemProfile.size,
      visibleMark: itemProfile.visibleMark,
      ocrText: itemProfile.ocrText,
      serialNumber: itemProfile.serialNumber,
      condition: 'Good',
      finderNotes: 'Handed to the security desk.'
    },
    images: analysis.data.imageUrl ? [analysis.data.imageUrl] : [],
    description: 'Black backpack found near the library entrance with books inside.',
    category: itemProfile.category || 'Backpack',
    location: 'Central Library entrance',
    coordinates: { lat: null, lng: null },
    foundAt: new Date().toISOString()
  };
  console.log(JSON.stringify(await postReport(token, foundShape), null, 2));

  console.log('\n--- case F: AI returned explicit nulls inside itemProfile ---');
  const withNulls = {
    ...base,
    itemProfile: {
      ...base.itemProfile,
      primaryColor: null,
      secondaryColor: null,
      brand: null,
      model: null,
      material: null,
      shape: null,
      size: null,
      visibleMark: null,
      ocrText: null,
      serialNumber: null
    }
  };
  console.log(JSON.stringify(await postReport(token, withNulls), null, 2));

  console.log('\n--- case G: lastSeen: null / images: null / lostAt: null ---');
  console.log('lastSeen:', JSON.stringify(await postReport(token, { ...base, lastSeen: null })));
  console.log('images  :', JSON.stringify(await postReport(token, { ...base, images: null })));
  console.log('lostAt  :', JSON.stringify(await postReport(token, { ...base, lostAt: null })));
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('repro failed:', err.message);
  process.exitCode = 1;
});
