/**
 * Notifications — every update LostLink AI has for the signed-in user in the
 * active organization.
 *
 * Design notes
 * - The raw notification types are collapsed into seven user-facing tabs
 *   (All / Matches / Verification / Returns / Reports / Organization / System)
 *   derived from NOTIFICATION_FILTERS so the vocabulary matches what people see.
 * - The API filters by a single `type`, so tabs that span several types are
 *   narrowed client-side on top of the server stream. Pagination therefore
 *   follows the server stream (limit/offset) while the tab narrows the view.
 * - The full-page empty state is only shown when the account genuinely has zero
 *   notifications; an empty filter gets an inline, recoverable state instead.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell, CheckCheck, Settings, Inbox, Filter, Sparkles,
  ShieldCheck, PackageCheck
} from 'lucide-react';
import {
  useNotifications, useNotificationSummary, useMarkNotificationRead, useMarkAllRead
} from '../lib/queries';
import { useOrganization } from '../context/OrganizationContext';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import NotificationItem from '../components/NotificationItem';
import ErrorState from '../components/ErrorState';
import { EmptyStates } from '../components/EmptyState';
import { Button } from '../components/ui/Button';
import { Progress } from '../components/ui/Progress';
import { SkeletonList, Skeleton } from '../components/ui/Skeleton';
import { cn } from '../lib/cn';
import { NOTIFICATION_FILTERS } from '../lib/format';

const PAGE_SIZE = 20;

/** Collapse the raw type list into the tabs a person actually thinks in. */
const TABS = NOTIFICATION_FILTERS.reduce((acc, filter) => {
  const existing = acc.find((tab) => tab.label === filter.label);
  if (existing) existing.types.push(filter.key);
  else acc.push({ id: filter.label, label: filter.label, types: [filter.key] });
  return acc;
}, []);

/** Which summary counter backs each tab badge. */
const COUNT_FIELD = {
  All: 'total',
  Matches: 'matches',
  Verification: 'verification',
  Returns: 'returns',
  Reports: 'reports',
  Organization: 'organization',
  System: 'system'
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { activeOrganizationId } = useOrganization();
  const orgId = activeOrganizationId;

  const [tabId, setTabId] = useState('All');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [stream, setStream] = useState([]);

  const activeTab = TABS.find((tab) => tab.id === tabId) || TABS[0];
  const isAllTab = activeTab.types.includes('ALL');

  // The API accepts exactly one type, so only single-type tabs filter server-side.
  const serverType = !isAllTab && activeTab.types.length === 1 ? activeTab.types[0] : undefined;

  const params = useMemo(() => ({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    read: unreadOnly ? 'false' : undefined,
    type: serverType
  }), [page, unreadOnly, serverType]);

  const {
    data, isLoading, isFetching, isPlaceholderData, isError, error, refetch
  } = useNotifications(orgId, params);

  const { data: summary, isLoading: summaryLoading } = useNotificationSummary(orgId);
  const markRead = useMarkNotificationRead(orgId);
  const markAll = useMarkAllRead(orgId);

  const filterKey = `${tabId}|${unreadOnly}`;

  // Any filter change restarts pagination and drops the previous stream.
  useEffect(() => {
    setPage(0);
    setStream([]);
  }, [filterKey]);

  // Accumulate pages. Placeholder data is the previous key's payload while the
  // next page loads, so it must never be merged into the stream.
  useEffect(() => {
    if (isPlaceholderData) return;
    const incoming = Array.isArray(data?.notifications) ? data.notifications : null;
    if (!incoming) return;
    setStream((prev) => {
      if (page === 0) return incoming;
      const seen = new Set(prev.map((n) => n.id));
      return [...prev, ...incoming.filter((n) => !seen.has(n.id))];
    });
  }, [data, page, isPlaceholderData]);

  const items = useMemo(() => {
    if (isAllTab) return stream;
    const allowed = new Set(activeTab.types);
    return stream.filter((n) => allowed.has(n.type));
  }, [stream, isAllTab, activeTab]);

  const serverTotal = data?.total ?? 0;
  const hasMore = (page + 1) * PAGE_SIZE < serverTotal;
  // True when the server stream already equals the tab (All or a single-type tab),
  // so `total` is a meaningful denominator for the visible list.
  const serverScoped = isAllTab || activeTab.types.length === 1;
  // The list response also carries `unread`, so the header still works if the
  // summary request fails.
  const unread = summary?.unread ?? data?.unread ?? 0;
  const scanPercent = serverTotal > 0 ? Math.min(100, Math.round((stream.length / serverTotal) * 100)) : 0;
  const noFiltersActive = isAllTab && !unreadOnly;
  const genuinelyEmpty = noFiltersActive && serverTotal === 0;

  const tabCount = (label) => {
    const field = COUNT_FIELD[label];
    if (!summary || !field) return null;
    return summary[field] ?? 0;
  };

  const handleMarkRead = (id) => {
    if (markRead.isPending) return;
    markRead.mutate(id, {
      onError: (err) => toast.error(err?.message || 'Could not mark that notification as read')
    });
  };

  const handleMarkAll = () => {
    markAll.mutate(undefined, {
      onSuccess: (res) => {
        toast.success(res?.updated
          ? `${res.updated} notification${res.updated === 1 ? '' : 's'} marked as read`
          : 'All notifications marked as read');
      },
      onError: (err) => toast.error(err?.message || 'Could not mark notifications as read')
    });
  };

  const filterSummary = [
    isAllTab ? null : activeTab.label,
    unreadOnly ? 'unread only' : null
  ].filter(Boolean).join(' · ');

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Stay updated on your recovery activity."
        badge={unread > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
            {unread} unread
          </span>
        ) : null}
        actions={(
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleMarkAll}
              loading={markAll.isPending}
              disabled={unread === 0}
              title={unread === 0 ? 'You have no unread notifications' : 'Mark every notification as read'}
            >
              <CheckCheck className="h-4 w-4" />
              Mark all as read
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
              <Settings className="h-4 w-4" />
              Notification settings
            </Button>
          </>
        )}
      />

      {/* Summary tiles */}
      {summaryLoading && !summary ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card-surface p-4">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="mt-3 h-7 w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            className="p-4"
            label="Unread"
            value={unread}
            icon={<Bell className="h-5 w-5" />}
            color="emerald"
            description={unread > 0 ? 'Needs your attention' : 'All caught up'}
            onClick={() => { setTabId('All'); setUnreadOnly(true); }}
          />
          <StatCard
            className="p-4"
            label="New Matches"
            value={summary?.matches ?? 0}
            icon={<Sparkles className="h-5 w-5" />}
            color="violet"
            description={`${summary?.matchesUnread ?? 0} unread`}
            onClick={() => { setTabId('Matches'); setUnreadOnly(false); }}
          />
          <StatCard
            className="p-4"
            label="Verification"
            value={summary?.verification ?? 0}
            icon={<ShieldCheck className="h-5 w-5" />}
            color="amber"
            description={`${summary?.verificationUnread ?? 0} unread`}
            onClick={() => { setTabId('Verification'); setUnreadOnly(false); }}
          />
          <StatCard
            className="p-4"
            label="Returns"
            value={summary?.returns ?? 0}
            icon={<PackageCheck className="h-5 w-5" />}
            color="sky"
            description={`${summary?.returnsUnread ?? 0} unread`}
            onClick={() => { setTabId('Returns'); setUnreadOnly(false); }}
          />
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin" role="tablist" aria-label="Notification categories">
          {TABS.map((tab) => {
            const active = tab.id === tabId;
            const count = tabCount(tab.label);
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                id={`tab-${tab.id.toLowerCase()}`}
                aria-selected={active}
                aria-controls="notifications-panel"
                onClick={() => setTabId(tab.id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition',
                  active
                    ? 'border-brand-200 bg-brand-50 text-brand-700 shadow-soft'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                {tab.label}
                {count !== null && (
                  <span className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-extrabold',
                    active ? 'bg-white text-brand-700' : 'bg-slate-100 text-slate-500'
                  )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={unreadOnly}
          onClick={() => setUnreadOnly((v) => !v)}
          className={cn(
            'inline-flex shrink-0 items-center gap-2 self-start rounded-full border px-4 py-2 text-xs font-bold transition sm:self-auto',
            unreadOnly
              ? 'border-brand-200 bg-brand-50 text-brand-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Unread only
        </button>
      </div>

      {/* List */}
      <div className="mt-4" id="notifications-panel" role="tabpanel" aria-label="Notification list">
        {isError ? (
          <ErrorState
            error={error}
            title="We couldn't load your notifications"
            onRetry={() => { refetch(); }}
          />
        ) : isLoading && stream.length === 0 ? (
          <SkeletonList count={6} />
        ) : genuinelyEmpty ? (
          <div className="card-surface">
            <EmptyStates.NoNotifications onAction={() => navigate('/report?type=lost')} />
          </div>
        ) : items.length === 0 ? (
          <div className="card-surface flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
              <Inbox className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">
                No notifications in {filterSummary}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                {unreadOnly && isAllTab
                  ? 'You have read everything in this organization. New activity will show up here automatically.'
                  : 'Nothing in this category yet. Try another tab or clear the filters.'}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => { setTabId('All'); setUnreadOnly(false); }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
              <span>
                {serverScoped
                  ? `Showing ${items.length} of ${serverTotal} notification${serverTotal === 1 ? '' : 's'}`
                  : `${items.length} notification${items.length === 1 ? '' : 's'} in ${filterSummary}`}
              </span>
              {unread > 0 && (
                <span className="font-semibold text-brand-700">{unread} still unread</span>
              )}
            </div>

            {/* `AnimatePresence` is what makes marking a row read feel like the
                row leaving rather than the list snapping: without it the `exit`
                animation on NotificationItem never runs. */}
            <motion.div layout className="space-y-3" role="list" aria-label="Notifications">
              <AnimatePresence initial={false}>
                {items.map((notification, i) => (
                  <div key={notification.id} role="listitem">
                    <NotificationItem
                      notification={notification}
                      onRead={() => handleMarkRead(notification.id)}
                      index={i}
                      showAction
                    />
                  </div>
                ))}
              </AnimatePresence>
            </motion.div>

            {hasMore && (
              <div className="mt-5 flex flex-col items-center gap-3">
                {!serverScoped && (
                  <div className="w-full max-w-sm">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Scanned {stream.length} of {serverTotal} notifications in this organization</span>
                      <span className="font-bold">{scanPercent}%</span>
                    </div>
                    <Progress value={scanPercent} color="primary" />
                  </div>
                )}
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => p + 1)}
                  loading={isFetching}
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
