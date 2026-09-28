/**
 * CSV writing, small enough to own.
 *
 * Two details that a naive `rows.join(',')` gets wrong and that matter for an
 * export a human will open in Excel:
 *
 *  1. Escaping — a comma, quote or newline inside a description must not shift
 *     every later column, so those cells are quoted and inner quotes doubled.
 *  2. Formula injection — a cell that begins with `=` `+` `-` or `@` is
 *     *executed* by spreadsheet apps. Descriptions and user-agent strings are
 *     free text, and an audit CSV is exactly the file a reviewer will open
 *     locally, so those cells get a leading apostrophe.
 *
 * Values are strings, numbers, dates or null. Objects are JSON-encoded once
 * (used for audit metadata) rather than flattened, so nothing is silently lost.
 */
const RISKY_PREFIX = /^[=+\-@\t\r]/;

const escapeCell = (value) => {
  if (value === null || value === undefined) return '';
  let str;
  if (value instanceof Date) str = value.toISOString();
  else if (typeof value === 'object') str = JSON.stringify(value);
  else str = String(value);

  if (RISKY_PREFIX.test(str)) str = `'${str}`;
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/**
 * Builds a CSV document.
 * `columns` is `[{ key, label, format? }]`; the header row is written even when
 * there are no rows, because an empty file with no columns is ambiguous between
 * "no data" and "export broke".
 */
function toCsv(columns, rows) {
  const header = columns.map((c) => escapeCell(c.label ?? c.key)).join(',');
  const body = (rows || []).map((row) => columns
    .map((c) => escapeCell(c.format ? c.format(row) : row[c.key]))
    .join(','));
  return [header, ...body].join('\r\n');
}

/** Common columns for a report row, shared by the analytics export. */
const REPORT_COLUMNS = [
  { key: 'reference', label: 'Reference' },
  { key: 'type', label: 'Type' },
  { key: 'status', label: 'Status' },
  { key: 'category', label: 'Category' },
  { key: 'itemName', label: 'Item', format: (r) => r.itemProfile?.itemName || '' },
  { key: 'brand', label: 'Brand', format: (r) => r.itemProfile?.brand || '' },
  { key: 'colour', label: 'Colour', format: (r) => r.itemProfile?.primaryColor || '' },
  { key: 'location', label: 'Location' },
  { key: 'description', label: 'Description' },
  { key: 'reportedBy', label: 'Reported by', format: (r) => r.userName || r.userId || '' },
  { key: 'createdAt', label: 'Reported at' },
  { key: 'updatedAt', label: 'Updated at' }
];

const AUDIT_COLUMNS = [
  { key: 'createdAt', label: 'When' },
  { key: 'action', label: 'Action' },
  { key: 'actor', label: 'Actor', format: (l) => l.actorName || l.userId || 'system' },
  { key: 'entityType', label: 'Entity' },
  { key: 'entityId', label: 'Entity id' },
  { key: 'ip', label: 'IP' },
  { key: 'userAgent', label: 'User agent' },
  { key: 'metadata', label: 'Metadata' }
];

/**
 * Sends a CSV as a download.
 * A UTF-8 BOM is prepended: without it Excel on Windows reads the file as
 * cp1252 and mangles any non-ASCII character in an item description.
 */
function csvResponse(res, filename, columns, rows) {
  const csv = `\uFEFF${toCsv(columns, rows)}`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // Let a browser (or the SPA's fetch) read the count without parsing the body.
  res.setHeader('X-Row-Count', String((rows || []).length));
  res.send(csv);
}

/** `lostlink-reports-2026-09-28.csv` */
const stamp = (prefix) => `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;

module.exports = { toCsv, csvResponse, REPORT_COLUMNS, AUDIT_COLUMNS, stamp, escapeCell };
