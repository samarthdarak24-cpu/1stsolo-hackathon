/**
 * Generates the demo item artwork used by the seeded reports.
 *
 *   node scripts/generateItemArt.js
 *
 * Writes one SVG per item into the uploads directory (already served read-only
 * at /uploads) and prints the public URL for each, ready to paste into seed.js.
 * Safe to re-run: output is deterministic and it overwrites in place.
 */
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { W, H, hex, shade, defs, backdrop } = require('./art/palette');
const { SHAPES, GENERIC } = require('./art/shapes');

/**
 * The 16 seeded items. `shape` picks the illustration; the colours come from
 * the same itemProfile fields the seed uses, so the art and the data agree.
 */
const ITEMS = [
  { slug: 'black-backpack',   shape: 'backpack',    primary: 'Black',  secondary: 'Blue' },
  { slug: 'hydro-flask',      shape: 'bottle',     primary: 'Green',  secondary: 'White' },
  { slug: 'navy-laptop-sleeve', shape: 'laptop',   primary: 'Navy',   secondary: 'Blue' },
  { slug: 'keyring-keys',     shape: 'keys',       primary: 'Silver', secondary: 'Red' },
  { slug: 'blue-umbrella',    shape: 'umbrella',   primary: 'Blue',   secondary: 'White' },
  { slug: 'mechanical-keyboard', shape: 'keyboard', primary: 'Black', secondary: 'Blue' },
  { slug: 'access-badge',     shape: 'badge',      primary: 'Teal',   secondary: 'White' },
  { slug: 'leather-wallet',   shape: 'wallet',     primary: 'Brown',  secondary: 'Tan' },
  { slug: 'reading-glasses',  shape: 'glasses',    primary: 'Silver', secondary: 'Blue' },
  { slug: 'grey-sports-shoe', shape: 'shoe',       primary: 'Grey',   secondary: 'White' },
  { slug: 'usb-c-charger',    shape: 'charger',    primary: 'White',  secondary: 'Grey' },
  { slug: 'black-a5-notebook', shape: 'notebook',  primary: 'Black',  secondary: 'Red' },
  { slug: 'phone-clear-case', shape: 'phone',      primary: 'Black',  secondary: 'Blue' },
  { slug: 'grey-glasses-case', shape: 'glassescase', primary: 'Grey', secondary: 'Black' },
  { slug: 'laptop-sticker-pack', shape: 'stickers', primary: 'Black', secondary: 'Green' },
  { slug: 'blue-headphones',  shape: 'headphone',  primary: 'Blue',   secondary: 'Black' },
  { slug: 'generic-item',    shape: 'generic',    primary: 'Slate',  secondary: 'Slate' },

  // The second demo dataset (see store/seed.js) — ten more items so the school
  // and the company each have a full recovery board. One illustration per item,
  // coloured from that item's own itemProfile.
  { slug: 'black-handbag',    shape: 'handbag',    primary: 'Black',  secondary: 'Silver' },
  { slug: 'blue-tablet',      shape: 'tablet',     primary: 'Blue',   secondary: 'White' },
  { slug: 'silver-watch',     shape: 'watch',      primary: 'Silver', secondary: 'Green' },
  { slug: 'black-headphones', shape: 'headphone',  primary: 'Black',  secondary: 'Red' },
  { slug: 'black-sunglasses', shape: 'spectacles', primary: 'Black',  secondary: 'Grey' },
  { slug: 'teal-water-bottle', shape: 'bottle',    primary: 'Teal',   secondary: 'White' },
  { slug: 'navy-track-pants', shape: 'trousers',   primary: 'Navy',   secondary: 'White' },
  { slug: 'silver-laptop-stand', shape: 'laptopstand', primary: 'Silver', secondary: 'Grey' },
  { slug: 'grey-wireless-mouse', shape: 'mouse',   primary: 'Grey',   secondary: 'Blue' },
  { slug: 'student-id-card',  shape: 'badge',      primary: 'Blue',   secondary: 'Yellow' },
  { slug: 'black-notebook',   shape: 'notebook',   primary: 'Black',  secondary: 'Blue' },
  { slug: 'green-umbrella',   shape: 'umbrella',   primary: 'Green',  secondary: 'White' },
  { slug: 'white-charger-brick', shape: 'charger', primary: 'White',  secondary: 'Grey' },
  { slug: 'brown-sunglasses', shape: 'spectacles', primary: 'Brown',  secondary: 'Beige' },
  { slug: 'orange-mug',       shape: 'mug',        primary: 'Orange', secondary: 'White' },
  { slug: 'red-hoodie',       shape: 'trousers',   primary: 'Red',    secondary: 'White' },
  { slug: 'black-earbuds',    shape: 'headphone',  primary: 'Black',  secondary: 'Blue' },
  { slug: 'leather-notebook', shape: 'notebook',   primary: 'Brown',  secondary: 'Tan' },
  { slug: 'black-phone-pouch', shape: 'phone',     primary: 'Black',  secondary: 'Green' },
  { slug: 'white-laptop-charger', shape: 'charger', primary: 'White', secondary: 'Black' },
  // Fallback for an item we have not drawn: artSlug() points here so a new
  // item name degrades to a neutral parcel rather than a broken image.
  { slug: 'generic-item',    shape: 'generic',    primary: 'Slate',  secondary: 'Slate' }
];

/** Compose one complete, standalone SVG document. */
function renderSvg(item) {
  const c = hex(item.primary);
  const a = hex(item.secondary);
  const body = (SHAPES[item.shape] || GENERIC)(c, a, shade(c, -0.35));
  const label = item.slug.replace(/-/g, ' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${label}">
  <title>${label}</title>${defs(c)}${backdrop()}
  ${body}
</svg>
`;
}

function main() {
  const dir = path.resolve(process.cwd(), config.uploads.dir, 'items');
  fs.mkdirSync(dir, { recursive: true });

  const manifest = ITEMS.map((item) => {
    const file = `${item.slug}.svg`;
    fs.writeFileSync(path.join(dir, file), renderSvg(item), 'utf8');
    return { slug: item.slug, url: `/uploads/items/${file}`, bytes: fs.statSync(path.join(dir, file)).size };
  });

  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const total = manifest.reduce((n, m) => n + m.bytes, 0);
  // eslint-disable-next-line no-console
  console.log(`[item-art] wrote ${manifest.length} SVGs (${(total / 1024).toFixed(1)} KB) -> ${dir}`);
  for (const m of manifest) {
    // eslint-disable-next-line no-console
    console.log(`  ${m.url}  (${(m.bytes / 1024).toFixed(1)} KB)`);
  }
}

if (require.main === module) main();

module.exports = { ITEMS, renderSvg };
