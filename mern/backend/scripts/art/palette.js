/**
 * Demo item artwork.
 *
 * The UI already knows how to render `report.images[0]` (14 call sites use
 * itemImage()). What it had was nothing to render: every seeded report shipped
 * with `images: []`, so all of them fell back to an emoji on a flat grey box.
 *
 * So we draw the images instead of downloading them. That keeps the demo fully
 * offline and deterministic - no stock-photo CDN to rate-limit, no network in CI,
 * and identical pixels on every machine. The colours are taken from the report's
 * own itemProfile, so a "Black Backpack" really does render black.
 *
 * Output: SVG (crisp at any size, ~2KB each) written into the uploads dir that
 * index.js already serves read-only at /uploads.
 */
const fs = require('fs');
const path = require('path');

const W = 800;
const H = 600;

/** Named colours used in the seed data -> hex. */
const COLORS = {
  black: '#22262b', blue: '#2563eb', navy: '#1e3a8a', green: '#16a34a',
  white: '#f1f5f9', brown: '#8b5e34', grey: '#8a94a6', gray: '#8a94a6',
  silver: '#cbd5e1', red: '#dc2626', beige: '#d6c3a5', yellow: '#eab308',
  pink: '#db2777', purple: '#7c3aed', teal: '#0d9488', orange: '#ea580c',
  maroon: '#7f1d1d', tan: '#c8a97e', slate: '#64748b'
};

function hex(name) {
  if (!name) return '#64748b';
  return COLORS[String(name).toLowerCase().trim()] || '#64748b';
}

/** Lighten/darken a #rrggbb colour by a percentage (-1..1). */
function shade(color, amount) {
  const n = parseInt(color.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  const mix = (c) => Math.round((t - c) * p + c);
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, '0')}`;
}

const isLight = (color) => {
  const n = parseInt(color.slice(1), 16);
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) > 165;
};

/** Contrast-safe ink colour for text/labels drawn over `bg`. */
const ink = (bg) => (isLight(bg) ? '#1e293b' : '#f8fafc');
const detail = (c) => shade(c, -0.35);
const highlight = (c) => shade(c, 0.3);

/**
 * Shared <defs>: background wash, floor shadow, item gradient.
 *
 * The ids are intentionally unsuffixed. Every illustration is written to its own
 * standalone .svg file, so there is no shared document to collide with, and the
 * shapes hard-code `url(#body)` / `url(#sh)`. Suffixing these would silently
 * break every gradient and drop shadow.
 */
function defs(c) {
  return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="${shade(c, 0.82)}"/>
      <stop offset="100%" stop-color="${shade(c, 0.6)}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.62">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="${highlight(c)}"/>
      <stop offset="55%" stop-color="${c}"/>
      <stop offset="100%" stop-color="${shade(c, -0.22)}"/>
    </linearGradient>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#0f172a" flood-opacity="0.22"/>
    </filter>
  </defs>`;
}

/** Backdrop + floor shadow shared by every illustration. */
function backdrop() {
  return `
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <ellipse cx="400" cy="516" rx="196" ry="26" fill="#0f172a" opacity="0.13"/>`;
}

module.exports = { W, H, COLORS, hex, shade, isLight, ink, detail, highlight, defs, backdrop };
