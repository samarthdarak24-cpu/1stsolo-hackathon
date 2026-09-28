/**
 * Shared formatting helpers. Keeping these in one place stops pages from
 * inventing slightly different date/number formats.
 */

export const STATUS_TONE = {
  REPORTED: 'info',
  FOUND: 'info',
  MATCHING: 'info',
  POTENTIAL_MATCH: 'warning',
  MATCHED: 'warning',
  VERIFICATION_PENDING: 'warning',
  MANUAL_REVIEW: 'warning',
  PENDING: 'warning',
  REVIEW: 'warning',
  PENDING_VERIFICATION: 'warning',
  VERIFIED: 'success',
  APPROVED: 'success',
  RETURN_READY: 'success',
  READY: 'success',
  COMPLETED: 'success',
  RETURNED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'danger',
  CLOSED: 'default',
  CANCELLED: 'default'
};

export const STATUS_LABEL = {
  REPORTED: 'Reported', FOUND: 'Found', MATCHING: 'Matching', POTENTIAL_MATCH: 'Potential match',
  MATCHED: 'Matched', VERIFICATION_PENDING: 'Verification pending', MANUAL_REVIEW: 'Needs review',
  PENDING: 'Pending', REVIEW: 'In review', PENDING_VERIFICATION: 'Pending verification',
  VERIFIED: 'Verified', APPROVED: 'Approved', RETURN_READY: 'Return ready', READY: 'Ready',
  COMPLETED: 'Completed', RETURNED: 'Returned', REJECTED: 'Rejected', EXPIRED: 'Expired',
  CLOSED: 'Closed', CANCELLED: 'Cancelled'
};

export const statusTone = (status) => STATUS_TONE[status] || 'default';
export const statusLabel = (status) => STATUS_LABEL[status] || status || 'Unknown';

export function formatDate(value, opts = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', ...opts });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function relativeTime(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return formatDate(value);
}

export function timeAgoLabel(value) {
  const label = relativeTime(value);
  return label ? `${label} · ${formatDateTime(value)}` : '—';
}

export function initialsOf(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('') || '?';
}

export function scoreTone(score) {
  if (score >= 85) return 'success';
  if (score >= 65) return 'warning';
  return 'default';
}

export function scoreLabel(score) {
  if (score >= 85) return 'High confidence';
  if (score >= 65) return 'Needs review';
  return 'Low confidence';
}

/**
 * Match band. Mirrors the server's own thresholds so the UI can never invent a
 * label, and it is the BAND that carries the meaning — a bare percentage invites
 * over-reading.
 */
export function scoreBand(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'Low';
  if (n >= 85) return 'High';
  if (n >= 65) return 'Medium';
  return 'Low';
}

/**
 * The category vocabulary offered by every form and filter. One list, so a
 * report filed through the wizard is findable through the Search filter.
 */
export const ITEM_CATEGORIES = [
  'Backpack', 'Handbag', 'Wallet', 'Phone', 'Laptop', 'Tablet', 'Headphones',
  'Charger', 'Watch', 'Keys', 'ID Card', 'Glasses', 'Water Bottle', 'Umbrella',
  'Clothing', 'Books', 'Sports Gear', 'Jewellery', 'Electronics', 'Personal',
  'Documents', 'Other'
];

/** Suggestions for an empty search box — real things people lose, not lorem. */
export const SEARCH_SUGGESTIONS = [
  'Backpack', 'Phone', 'ID card', 'Keys', 'Water bottle', 'Headphones', 'Wallet', 'Laptop'
];

export const NOTIFICATION_ICON = {
  NEW_MATCH: 'Sparkles',
  VERIFICATION_REQUIRED: 'ShieldCheck',
  VERIFICATION_RESULT: 'ShieldCheck',
  RETURN_READY: 'PackageCheck',
  ITEM_RETURNED: 'CircleCheck',
  REPORT_UPDATE: 'FileText',
  ORGANIZATION: 'Building2',
  SYSTEM: 'Bell'
};

export const NOTIFICATION_TONE = {
  NEW_MATCH: 'violet',
  VERIFICATION_REQUIRED: 'amber',
  VERIFICATION_RESULT: 'emerald',
  RETURN_READY: 'sky',
  ITEM_RETURNED: 'emerald',
  REPORT_UPDATE: 'slate',
  ORGANIZATION: 'sky',
  SYSTEM: 'slate'
};

export const NOTIFICATION_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'NEW_MATCH', label: 'Matches' },
  { key: 'VERIFICATION_REQUIRED', label: 'Verification' },
  { key: 'VERIFICATION_RESULT', label: 'Verification' },
  { key: 'RETURN_READY', label: 'Returns' },
  { key: 'ITEM_RETURNED', label: 'Returns' },
  { key: 'REPORT_UPDATE', label: 'Reports' },
  { key: 'ORGANIZATION', label: 'Organization' },
  { key: 'SYSTEM', label: 'System' }
];

export const RECOVERY_STAGES = [
  { key: 'REPORTED', label: 'Reported' },
  { key: 'POTENTIAL_MATCH', label: 'Match Found' },
  { key: 'VERIFICATION_PENDING', label: 'Verified' },
  { key: 'RETURN_READY', label: 'Return Ready' },
  { key: 'RETURNED', label: 'Returned' }
];

/**
 * Recovery-pipeline rows for the user dashboard.
 *
 * `RECOVERY_STAGES` keys are report *statuses* (used by ReportDetail), while the
 * dashboard needs the aggregate bucket names the backend actually returns on
 * `GET /api/dashboard` -> `recovery`. Deriving the bucket from the status key
 * (POTENTIAL_MATCH -> potential_match) silently produced undefined for three of
 * the five rows, so the pipeline read 0/0/0/1 instead of 0/2/1/1.
 */
export const RECOVERY_BUCKETS = [
  { key: 'reported', label: 'Reported' },
  { key: 'matched', label: 'Match Found' },
  { key: 'verifying', label: 'Verified' },
  { key: 'ready', label: 'Return Ready' },
  { key: 'returned', label: 'Returned' }
];

export function itemName(report) {
  return report?.itemProfile?.itemName || report?.category || 'Untitled item';
}

export function itemImage(report, fallback = null) {
  return report?.images?.find(Boolean) || fallback;
}

export function toInputDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
