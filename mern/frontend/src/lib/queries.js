/**
 * TanStack Query hooks — the single data-access layer for the app.
 *
 * Every hook is organization-scoped: the active organization id is part of the
 * query key, so switching organizations automatically refetches the whole app
 * and never shows another tenant's cached data.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';

export const qk = {
  dashboard: (orgId, period) => ['dashboard', orgId, period],
  unread: (orgId) => ['unread', orgId],
  directory: (orgId) => ['directory', orgId],
  reports: (orgId, params) => ['reports', orgId, params],
  report: (orgId, id) => ['report', orgId, id],
  matches: (orgId, params) => ['matches', orgId, params],
  match: (orgId, id) => ['match', orgId, id],
  notifications: (orgId, params) => ['notifications', orgId, params],
  notificationSummary: (orgId) => ['notification-summary', orgId],
  returns: (orgId) => ['returns', orgId],
  return: (orgId, id) => ['return', orgId, id],
  profile: () => ['profile'],
  organizations: () => ['organizations'],
  orgUsers: (orgId) => ['org-users', orgId],
  orgSettings: (orgId) => ['org-settings', orgId],
  verifications: (orgId, params) => ['verifications', orgId, params],
  orgAnalytics: (orgId, period) => ['org-analytics', orgId, period],
  userAnalytics: (orgId, period) => ['user-analytics', orgId, period],
  auditLogs: (orgId, params) => ['audit-logs', orgId, params],
  custody: (orgId, params) => ['custody', orgId, params],
  reportCustody: (orgId, reportId) => ['custody', orgId, 'report', reportId],
  cctvStatus: () => ['cctv-status'],
  cctvEvents: (orgId, reportId) => ['cctv-events', orgId, reportId],
  search: (orgId, term) => ['search', orgId, term],
  discovery: (orgId, term) => ['discovery', orgId, term],
  aiProvider: () => ['ai-provider'],
  modelInventory: (verify) => ['model-inventory', verify]
};

/* ---------------- dashboard ---------------- */
export const useDashboard = (orgId, period = '30d') =>
  useQuery({
    queryKey: qk.dashboard(orgId, period),
    queryFn: () => api.getDashboard(period),
    enabled: Boolean(orgId),
    staleTime: 30_000
  });

export const useUnreadCount = (orgId) =>
  useQuery({
    queryKey: qk.unread(orgId),
    queryFn: api.getUnread,
    enabled: Boolean(orgId),
    refetchInterval: 60_000,
    staleTime: 20_000
  });

/** Member display names for the active organization (id -> name). */
export const useDirectory = (orgId) =>
  useQuery({
    queryKey: qk.directory(orgId),
    queryFn: api.getDirectory,
    enabled: Boolean(orgId),
    staleTime: 300_000
  });

/* ---------------- reports ---------------- */
export const useReports = (orgId, params = {}) =>
  useQuery({
    queryKey: qk.reports(orgId, params),
    queryFn: () => api.listReports(params),
    enabled: Boolean(orgId),
    placeholderData: (prev) => prev
  });

export const useReport = (orgId, id) =>
  useQuery({
    queryKey: qk.report(orgId, id),
    queryFn: () => api.getReport(id),
    enabled: Boolean(orgId && id)
  });

export const useCreateReport = (orgId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, payload }) =>
      (type === 'LOST' ? api.createLostReport(payload) : api.createFoundReport(payload)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports', orgId] });
      qc.invalidateQueries({ queryKey: ['dashboard', orgId] });
      qc.invalidateQueries({ queryKey: ['matches', orgId] });
    }
  });
};

/* ---------------- report photos ---------------- */
/**
 * Attaches a photo the user chose to one of their own reports.
 *
 * The report's own key is not the only one that has to be invalidated: the new
 * photo becomes the cover every list, match card and dashboard tile renders, and
 * the server re-runs matching from it.
 */
export const useAddReportImage = (orgId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, file }) => api.addReportImage(reportId, file),
    onSuccess: (_data, { reportId }) => {
      qc.invalidateQueries({ queryKey: qk.report(orgId, reportId) });
      qc.invalidateQueries({ queryKey: ['reports', orgId] });
      qc.invalidateQueries({ queryKey: ['matches', orgId] });
      qc.invalidateQueries({ queryKey: ['dashboard', orgId] });
    }
  });
};

/** Detaches one photo from a report (the cover is what the UI offers to remove). */
export const useRemoveReportImage = (orgId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, url }) => api.removeReportImage(reportId, url),
    onSuccess: (_data, { reportId }) => {
      qc.invalidateQueries({ queryKey: qk.report(orgId, reportId) });
      qc.invalidateQueries({ queryKey: ['reports', orgId] });
      qc.invalidateQueries({ queryKey: ['matches', orgId] });
    }
  });
};

/* ---------------- matches ---------------- */
export const useMatches = (orgId, params = {}) =>
  useQuery({
    queryKey: qk.matches(orgId, params),
    queryFn: () => api.listMatches(params),
    enabled: Boolean(orgId),
    placeholderData: (prev) => prev
  });

export const useMatch = (orgId, id) =>
  useQuery({
    queryKey: qk.match(orgId, id),
    queryFn: () => api.getMatch(id),
    enabled: Boolean(orgId && id)
  });

/* ---------------- notifications ---------------- */
export const useNotifications = (orgId, params = {}) =>
  useQuery({
    queryKey: qk.notifications(orgId, params),
    queryFn: () => api.listNotifications(params),
    enabled: Boolean(orgId),
    // The bell has to move on its own: match found, verification started and
    // handover released are all server-side events, and polling the inbox every
    // 15s keeps them honest without inventing a websocket layer.
    refetchInterval: 15_000,
    placeholderData: (prev) => prev
  });

export const useNotificationSummary = (orgId) =>
  useQuery({
    queryKey: qk.notificationSummary(orgId),
    queryFn: api.notificationSummary,
    enabled: Boolean(orgId),
    refetchInterval: 15_000
  });

export const useMarkNotificationRead = (orgId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.markNotificationRead(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['notifications', orgId] });
      const previous = qc.getQueriesData({ queryKey: ['notifications', orgId] });
      qc.setQueriesData({ queryKey: ['notifications', orgId] }, (old) =>
        (old?.notifications || []).map(n => (n.id === id ? { ...n, read: true } : n)));
      return { previous };
    },
    onError: (_err, _id, context) => {
      context?.previous?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notifications', orgId] });
      qc.invalidateQueries({ queryKey: ['notification-summary', orgId] });
      qc.invalidateQueries({ queryKey: ['unread', orgId] });
    }
  });
};

export const useMarkAllRead = (orgId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notifications', orgId] });
      qc.invalidateQueries({ queryKey: ['notification-summary', orgId] });
      qc.invalidateQueries({ queryKey: ['unread', orgId] });
    }
  });
};

/* ---------------- returns ---------------- */
export const useReturns = (orgId) =>
  useQuery({ queryKey: qk.returns(orgId), queryFn: () => api.listReturns(), enabled: Boolean(orgId) });

export const useReturn = (orgId, id) =>
  useQuery({ queryKey: qk.return(orgId, id), queryFn: () => api.getReturnQr(id), enabled: Boolean(orgId && id) });

/* ---------------- verification ---------------- */
export const useVerifications = (orgId, params = {}) =>
  useQuery({ queryKey: qk.verifications(orgId, params), queryFn: () => api.listVerifications(params), enabled: Boolean(orgId) });

/* ---------------- profile / org ---------------- */
export const useProfile = () => useQuery({ queryKey: qk.profile(), queryFn: api.getProfile, staleTime: 60_000 });

export const useOrganizations = () =>
  useQuery({ queryKey: qk.organizations(), queryFn: api.listMyOrgs, staleTime: 60_000 });

export const useOrgUsers = (orgId) =>
  useQuery({ queryKey: qk.orgUsers(orgId), queryFn: () => api.listOrgUsers(orgId), enabled: Boolean(orgId) });

export const useOrgSettings = (orgId) =>
  useQuery({ queryKey: qk.orgSettings(orgId), queryFn: () => api.getOrgSettings(orgId), enabled: Boolean(orgId) });

/* ---------------- analytics / audit / search ---------------- */
export const useUserAnalytics = (orgId, period = '30d') =>
  useQuery({ queryKey: qk.userAnalytics(orgId, period), queryFn: () => api.getUserAnalytics(period), enabled: Boolean(orgId) });

export const useOrgAnalytics = (orgId, period = '30d') =>
  useQuery({
    queryKey: qk.orgAnalytics(orgId, period),
    queryFn: () => api.getOrgAnalytics(period),
    enabled: Boolean(orgId),
    retry: false
  });

export const useAuditLogs = (orgId, params = {}) =>
  useQuery({ queryKey: qk.auditLogs(orgId, params), queryFn: () => api.listAuditLogs(params), enabled: Boolean(orgId), retry: false });

export const useSearch = (orgId, term) =>
  useQuery({
    queryKey: qk.search(orgId, term),
    queryFn: () => api.search(term),
    enabled: Boolean(orgId && term && term.length >= 2),
    staleTime: 15_000
  });

/**
 * Discovery search for the Search page.
 *
 * Same org-scoped endpoint as the topbar's typeahead, but asked for a real
 * result set (40) instead of a 6-row preview, and kept in its own cache entry so
 * a browse session never fights the dropdown. The server matches on description,
 * category, location, reference, item name, brand, colour and visible mark, and
 * it returns lost AND found reports for the whole organization — which is what
 * makes "is my item already in the lost & found?" answerable by a member.
 */
export const useDiscovery = (orgId, term) =>
  useQuery({
    queryKey: qk.discovery(orgId, term),
    queryFn: () => api.search(term, 40),
    enabled: Boolean(orgId && term && term.trim().length >= 2),
    staleTime: 15_000,
    placeholderData: (prev) => prev
  });

export const useAiProvider = () => useQuery({ queryKey: qk.aiProvider(), queryFn: api.getAiProvider, staleTime: 300_000 });

/**
 * Model inventory for the AI Models panel.
 *
 * Two distinct queries on purpose: the plain inventory is cheap and loads with
 * the page, while `verify` runs a real micro-inference per model and is fetched
 * only after a human asks for it. They are separate cache entries so a slow
 * verification can never block the cheap read.
 */
export const useModelInventory = ({ verify = false, enabled = true } = {}) =>
  useQuery({
    queryKey: qk.modelInventory(verify),
    queryFn: () => api.getModelInventory(verify),
    enabled,
    retry: false,
    staleTime: verify ? 0 : 30_000
  });

/* ---------------- chain of custody ---------------- */
/** Organization-wide custody rows, newest first. */
export const useCustody = (orgId, params = {}) =>
  useQuery({
    queryKey: qk.custody(orgId, params),
    queryFn: () => api.listCustody(params),
    enabled: Boolean(orgId),
    placeholderData: (prev) => prev
  });

/** The full trail for one item, oldest first. */
export const useReportCustody = (orgId, reportId) =>
  useQuery({
    queryKey: qk.reportCustody(orgId, reportId),
    queryFn: () => api.getReportCustody(reportId),
    enabled: Boolean(orgId && reportId),
    retry: false
  });

export const useAddCustodyRecord = (orgId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, payload }) => api.addCustodyRecord(reportId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custody', orgId] });
      qc.invalidateQueries({ queryKey: ['audit-logs', orgId] });
    }
  });
};

/**
 * Capability report for the analysis service. Kept separate from the analyze
 * mutation so the page can state what is possible before anyone tries.
 */
export const useCctvStatus = (orgId) =>
  useQuery({
    queryKey: qk.cctvStatus(),
    queryFn: api.getCctvStatus,
    enabled: Boolean(orgId),
    staleTime: 30_000,
    retry: false
  });

/** Recorded clip evidence for one item. Empty is a valid, meaningful answer. */
export const useCctvEvents = (orgId, reportId) =>
  useQuery({
    queryKey: qk.cctvEvents(orgId, reportId),
    queryFn: () => api.getCctvEvents(reportId),
    enabled: Boolean(orgId && reportId),
    retry: false
  });

export const useAnalyzeClip = (orgId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.analyzeClip(payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['reports', orgId] });
      qc.invalidateQueries({ queryKey: ['audit-logs', orgId] });
      // A successful search wrote evidence rows: show them without a reload.
      if (variables?.reportId) {
        qc.invalidateQueries({ queryKey: qk.cctvEvents(orgId, variables.reportId) });
      }
    }
  });
};
