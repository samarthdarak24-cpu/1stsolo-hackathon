/**
 * API client.
 * - Attaches the JWT automatically.
 * - Normalises errors into ApiError (status + message + details) so every page
 *   can render a friendly, stack-trace-free failure state.
 * - On 401 the session is cleared and the app is bounced to /login.
 */
const TOKEN_KEY = 'lostlink_token';
const USER_KEY = 'lostlink_user';
const API_BASE = (import.meta.env.VITE_API_URL || '')
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');

export const resolveUrl = (path) => {
  if (!path) return path;
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) return path;
  const base = API_BASE || '';
  return `${base}${path}`;
};

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details || null;
  }
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  user: () => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  },
  setUser: (user) => localStorage.setItem(USER_KEY, JSON.stringify(user)),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

const onUnauthorized = () => {
  tokenStore.clear();
  if (window.location.hash !== '#/login' && window.location.pathname !== '/login') {
    window.location.hash = '/login';
  }
};

async function request(path, { method = 'GET', body, auth = true, signal, isForm = false } = {}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  const url = resolveUrl(path);

  try {
    res = await fetch(url, {
      method,
      headers,
      signal,
      body: isForm ? body : (body !== undefined ? JSON.stringify(body) : undefined)
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the LostLink AI service. Check your connection and try again.', 0);
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) onUnauthorized();
    throw new ApiError(data.message || `Request failed (${res.status})`, res.status, data.details);
  }
  return data;
}

const qs = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') search.append(k, v);
  });
  const str = search.toString();
  return str ? `?${str}` : '';
};

export const api = {
  /* ---- auth ---- */
  checkDomain: (email) => request('/api/auth/check-domain', { method: 'POST', body: { email }, auth: false }),
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => request('/api/auth/me'),
  switchOrg: (orgId) => request('/api/auth/switch-org', { method: 'PATCH', body: { orgId } }),
  verifyEmail: (email) => request('/api/auth/verify', { method: 'POST', body: { email }, auth: false }),
  forgotPassword: (email) => request('/api/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (token, password) => request('/api/auth/reset-password', { method: 'POST', body: { token, password }, auth: false }),

  /* ---- dashboard / profile / search ---- */
  getDashboard: (period = '30d') => request(`/api/dashboard${qs({ period })}`),
  getUnread: () => request('/api/dashboard/unread'),
  getDirectory: () => request('/api/directory'),
  getProfile: () => request('/api/profile'),
  updateProfile: (payload) => request('/api/profile', { method: 'PATCH', body: payload }),
  /** Avatar photo. Multipart, like the report photos — the server stores it. */
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('image', file);
    return request('/api/profile/avatar', { method: 'POST', body: form, isForm: true });
  },
  changePassword: (payload) => request('/api/profile/password', { method: 'POST', body: payload }),
  search: (q, limit = 6) => request(`/api/search${qs({ q, limit })}`),

  /* ---- service status ---- */
  getHealth: (refresh = false) => request(`/api/health${refresh ? '?refresh=1' : ''}`),
  /**
   * Per-model inventory. `verify` makes the inference service run one real
   * micro-inference per model, so it is slow and only called on demand.
   */
  getModelInventory: (verify = false) => request(`/api/health/models${verify ? '?verify=1' : ''}`),

  /* ---- AI ---- */
  getAiProvider: () => request('/api/ai/provider'),
  analyzeItem: (file, type) => {
    const form = new FormData();
    form.append('image', file);
    form.append('type', type);
    return request('/api/ai/analyze-item', { method: 'POST', body: form, isForm: true });
  },

  /* ---- organizations ---- */
  listMyOrgs: () => request('/api/organizations/me/organizations'),
  createOrg: (payload) => request('/api/organizations/create', { method: 'POST', body: payload }),
  joinOrg: (inviteCode) => request('/api/organizations/join', { method: 'POST', body: { inviteCode } }),
  setActiveOrg: (orgId) => request('/api/organizations/me/active-organization', { method: 'PATCH', body: { orgId } }),
  getOrg: (id) => request(`/api/organizations/${id}`),
  updateOrg: (id, payload) => request(`/api/organizations/${id}`, { method: 'PATCH', body: payload }),
  getOrgSettings: (id) => request(`/api/organizations/${id}/settings`),
  updateOrgSettings: (id, payload) => request(`/api/organizations/${id}/settings`, { method: 'PATCH', body: payload }),
  listOrgUsers: (id) => request(`/api/organizations/${id}/users`),
  updateUserRole: (id, userId, role) => request(`/api/organizations/${id}/users/${userId}`, { method: 'PATCH', body: { role } }),
  inviteUser: (id, payload) => request(`/api/organizations/${id}/invite`, { method: 'POST', body: payload }),

  /* ---- reports ---- */
  listReports: (params = {}) => request(`/api/reports${qs(params)}`),
  getReport: (id) => request(`/api/reports/${id}`),
  getReportTimeline: (id) => request(`/api/reports/${id}/timeline`),
  createLostReport: (payload) => request('/api/reports/lost', { method: 'POST', body: payload }),
  createFoundReport: (payload) => request('/api/reports/found', { method: 'POST', body: payload }),
  updateReport: (id, payload) => request(`/api/reports/${id}`, { method: 'PATCH', body: payload }),
  deleteReport: (id) => request(`/api/reports/${id}`, { method: 'DELETE' }),
  rematch: (id) => request(`/api/reports/${id}/rematch`, { method: 'POST' }),
  /**
   * Attaches a photo the user picked themselves to one of their reports.
   * Multipart, so the browser sets its own Content-Type boundary — hence isForm.
   */
  addReportImage: (id, file) => {
    const form = new FormData();
    form.append('image', file);
    return request(`/api/reports/${id}/image`, { method: 'POST', body: form, isForm: true });
  },
  /** Detaches one photo (by the /uploads url) from a report. */
  removeReportImage: (id, url) => request(`/api/reports/${id}/image`, { method: 'DELETE', body: { url } }),

  /* ---- matches ---- */
  listMatches: (params = {}) => request(`/api/matches${qs(params)}`),
  getMatch: (id) => request(`/api/matches/${id}`),
  reviewMatch: (id, payload) => request(`/api/matches/${id}/review`, { method: 'POST', body: payload }),

  /* ---- verification ---- */
  startVerification: (matchId) => request('/api/verifications', { method: 'POST', body: { matchId } }),
  submitVerificationAnswer: (id, payload) => request(`/api/verifications/${id}/answer`, { method: 'POST', body: payload }),
  reviewVerification: (id, payload) => request(`/api/verifications/${id}/review`, { method: 'POST', body: payload }),
  listVerifications: (params = {}) => request(`/api/verifications${qs(params)}`),

  /* ---- notifications ---- */
  listNotifications: (params = {}) => request(`/api/notifications${qs(params)}`),
  notificationSummary: () => request('/api/notifications/summary'),
  markNotificationRead: (id) => request(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => request('/api/notifications/read-all', { method: 'PATCH' }),

  /* ---- returns ---- */
  listReturns: (params = {}) => request(`/api/returns${qs(params)}`),
  getReturn: (id) => request(`/api/returns/${id}`),
  getReturnQr: (id) => request(`/api/returns/${id}/qr`),
  refreshQr: (id) => request(`/api/returns/${id}/refresh-qr`, { method: 'POST' }),
  createReturnAuthorization: (reportId, payload) => request(`/api/returns/${reportId}/create`, { method: 'POST', body: payload }),
  scanQr: (id, payload) => request(`/api/returns/${id}/scan-qr`, { method: 'POST', body: payload }),

  /* ---- chain of custody ---- */
  listCustody: (params = {}) => request(`/api/custody${qs(params)}`),
  getCustodyRecord: (id) => request(`/api/custody/${id}`),
  getReportCustody: (reportId) => request(`/api/reports/${reportId}/custody`),
  addCustodyRecord: (reportId, payload) => request(`/api/reports/${reportId}/custody`, { method: 'POST', body: payload }),

  /* ---- CCTV / last-seen analysis ---- */
  getCctvStatus: () => request('/api/cctv/status'),
  getCctvEvents: (reportId) => request(`/api/cctv/events/${reportId}`),
  analyzeClip: (payload) => request('/api/cctv/analyze', { method: 'POST', body: payload }),

  /* ---- analytics / audit ---- */
  getUserAnalytics: (period = '30d') => request(`/api/analytics/user${qs({ period })}`),
  getOrgAnalytics: (period = '30d') => request(`/api/analytics/organization${qs({ period })}`),
  listAuditLogs: (params = {}) => request(`/api/audit-logs${qs(params)}`),
  listActionTypes: () => request('/api/audit-log-types')
};

export default api;
