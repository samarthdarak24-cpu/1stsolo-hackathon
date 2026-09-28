import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Boxes,
  ClipboardList,
  Link2,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  ShieldCheck,
  Sparkles,
  Users,
  Video
} from 'lucide-react';
import { useOrganization } from '../context/OrganizationContext';
import { useOrgAnalytics, useNotificationSummary } from '../lib/queries';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import { Skeleton, SkeletonStats } from '../components/ui/Skeleton';
import { Progress } from '../components/ui/Progress';
import { scoreTone, scoreLabel } from '../lib/format';
import { cn } from '../lib/cn';

const PERIODS = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' }
];

/** Report-volume trend between this window and the one before it. */
function periodTrend(stats) {
  const now = stats?.thisPeriodReports || 0;
  const before = stats?.previousPeriodReports || 0;
  if (!before) return now > 0 ? 100 : 0;
  return Math.round(((now - before) / before) * 100);
}

/**
 * Inline SVG column chart. No chart library: the series is small, fixed and
 * computed from `weeklyActivity`, so hand-rolled SVG keeps the bundle small.
 */
function ActivityChart({ data = [] }) {
  const points = data.map((d) => ({ label: String(d.label ?? ''), value: Number(d.value) || 0 }));
  const total = points.reduce((sum, p) => sum + p.value, 0);

  if (!points.length) {
    return (
      <EmptyState
        compact
        illustration="📈"
        title="No activity recorded"
        description="Once reports are created in this window their volume is charted here."
      />
    );
  }

  const max = Math.max(1, ...points.map((p) => p.value));
  const W = 640;
  const H = 170;
  const padTop = 8;
  const plot = H - padTop;
  const slot = W / points.length;
  const barW = Math.max(8, Math.min(38, slot * 0.55));

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Reports created per period, ${total} in total`}
      >
        {points.map((p, i) => {
          const h = p.value > 0 ? Math.max(5, (p.value / max) * plot) : 2;
          const x = slot * i + (slot - barW) / 2;
          return (
            <rect
              key={`${p.label}-${i}`}
              x={x}
              y={padTop + plot - h}
              width={barW}
              height={h}
              rx={Math.min(8, barW / 2)}
              fill={p.value > 0 ? '#059669' : '#e2e8f0'}
            >
              <title>{`${p.label}: ${p.value} report${p.value === 1 ? '' : 's'}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1.5 flex">
        {points.map((p, i) => (
          <span key={`label-${p.label}-${i}`} className="flex-1 truncate text-center text-[10px] font-semibold text-slate-400">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function BreakdownBars({ items = [], total, emptyLabel }) {
  if (!items.length) {
    return <p className="py-6 text-center text-sm text-slate-500">{emptyLabel}</p>;
  }
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
  const sum = total || items.reduce((acc, i) => acc + (Number(i.value) || 0), 0);

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const value = Number(item.value) || 0;
        const share = sum > 0 ? Math.round((value / sum) * 100) : 0;
        return (
          <li key={item.label}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-semibold text-slate-700">{item.label}</span>
              <span className="shrink-0 tabular-nums text-xs font-bold text-slate-500">
                {value} · {share}%
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${Math.max(value > 0 ? 4 : 0, (value / max) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * OrgDashboard — organization command centre rendered inside AppLayout.
 * Reads exactly two endpoints: /api/analytics/organization (stats, breakdowns,
 * activity, recent matches) and /api/notifications/summary (unread badge).
 */
export default function OrgDashboard() {
  const navigate = useNavigate();
  const { activeOrganization, activeOrganizationId, isManager, role } = useOrganization();
  const [period, setPeriod] = useState('30d');

  const { data, isLoading, isError, error, refetch } = useOrgAnalytics(activeOrganizationId, period);
  const { data: notificationSummary } = useNotificationSummary(activeOrganizationId);

  const stats = data?.stats;
  const recentMatches = data?.recentMatches || [];
  const categoryBreakdown = data?.categoryBreakdown || [];
  const weeklyActivity = data?.weeklyActivity || [];

  // One card per destination in the sidebar, not per feature. The overview is
  // a launch pad into the six places work actually happens; the feature-level
  // entries now live inside those sections as tabs.
  const quickLinks = useMemo(() => {
    const links = [
      { to: '/organization/recovery', label: 'Recovery Queue', description: 'Reports and candidate matches', icon: ClipboardList, color: 'text-sky-600', bg: 'bg-sky-50' },
      { to: '/organization/verification', label: 'Verification', description: 'Ownership challenges awaiting review', icon: ShieldCheck, color: 'text-amber-600', bg: 'bg-amber-50' },
      { to: '/organization/operations', label: 'Operations', description: 'Inventory, custody and last seen', icon: Boxes, color: 'text-emerald-600', bg: 'bg-emerald-50' }
    ];
    if (isManager) {
      links.push({ to: '/organization/insights', label: 'Insights', description: 'Analytics, audit and AI model status', icon: Activity, color: 'text-teal-600', bg: 'bg-teal-50' });
      links.push({ to: '/organization/people', label: 'People & settings', description: 'Members, roles and organization policy', icon: Users, color: 'text-brand-700', bg: 'bg-brand-50' });
    }
    return links;
  }, [isManager]);

  const periodChange = periodTrend(stats);
  const orgName = activeOrganization?.name || 'Organization';

  return (
    <div className="stagger">
      <PageHeader
        title={`${orgName} command center`}
        eyebrow={`Organization · ${role}`}
        subtitle="Every report, match, verification and return for this organization — live."
        badge={
          notificationSummary?.unread > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              {notificationSummary.unread} unread alert{notificationSummary.unread === 1 ? '' : 's'}
            </span>
          ) : null
        }
        actions={(
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={cn(
                  'rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all duration-150',
                  period === p.key
                    ? 'bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      />

      {isError && (
        <ErrorState error={error} onRetry={() => refetch()} className="mb-6" />
      )}

      {isLoading ? (
        <div className="stagger space-y-6">
          <SkeletonStats count={6} />
          <div className="card-surface p-6">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-40 w-full" />
          </div>
        </div>
      ) : (
        !isError && (
          <div className="stagger space-y-6">
            <div className="stagger-fast grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <StatCard
                label="Total reports"
                value={stats?.totalReports ?? 0}
                icon={<ClipboardList className="h-5 w-5" />}
                color="sky"
                trend={periodChange}
                trendLabel="vs previous period"
                description={`${stats?.thisPeriodReports ?? 0} in the last ${PERIODS.find((p) => p.key === period)?.label}`}
              />
              <StatCard
                label="Lost items"
                value={stats?.lostReports ?? 0}
                icon={<PackageMinus className="h-5 w-5" />}
                color="amber"
                description="Reports filed by owners"
              />
              <StatCard
                label="Found items"
                value={stats?.foundReports ?? 0}
                icon={<PackagePlus className="h-5 w-5" />}
                color="emerald"
                description="Items handed in to staff"
              />
              <StatCard
                label="AI matches"
                value={stats?.matches ?? 0}
                icon={<Sparkles className="h-5 w-5" />}
                color="violet"
                description={`${stats?.highConfidenceMatches ?? 0} at high confidence`}
                onClick={() => navigate('/organization/recovery?tab=matches')}
              />
              <StatCard
                label="Verifications"
                value={stats?.pendingVerifications ?? 0}
                icon={<ShieldCheck className="h-5 w-5" />}
                color="rose"
                description="Ownership checks pending"
                onClick={() => navigate('/organization/verification')}
              />
              <StatCard
                label="Members"
                value={stats?.members ?? 0}
                icon={<Users className="h-5 w-5" />}
                color="indigo"
                description="Active in this organization"
              />
            </div>

            {/* `items-start` would let the shorter column float, leaving a ragged
                bottom edge. Stretching both panels keeps the row aligned, and
                the chart grows to fill rather than sitting in dead space. */}
            <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
              <section className="card-surface flex flex-col p-6">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Report volume</h2>
                    <p className="text-sm text-slate-500">
                      {weeklyActivity.reduce((sum, p) => sum + (Number(p.value) || 0), 0)} reports created in this window
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/organization/insights')}
                    className="text-xs font-bold text-brand-700 transition-colors hover:text-brand-800 hover:underline"
                  >
                    Full analytics
                  </button>
                </div>
                <div className="min-h-[220px] flex-1">
                  <ActivityChart data={weeklyActivity} />
                </div>
              </section>

              <section className="card-surface flex flex-col p-6">
                <h2 className="text-base font-bold text-slate-900">Recovery rates</h2>
                <p className="mb-5 text-sm text-slate-500">Computed from every report in this organization</p>
                <div className="space-y-4">
                  {[
                    { label: 'Match rate', value: stats?.matchRate ?? 0, hint: 'matches ÷ reports' },
                    { label: 'Return rate', value: stats?.returnRate ?? 0, hint: 'completed returns ÷ matches' },
                    { label: 'Resolution rate', value: stats?.resolutionRate ?? 0, hint: 'returned ÷ reports' }
                  ].map((rate) => (
                    <div key={rate.label}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-700">{rate.label}</span>
                        <span className="text-lg font-extrabold tabular-nums text-slate-900">{rate.value}%</span>
                      </div>
                      <Progress
                        className="mt-1.5"
                        color={rate.value >= 60 ? 'success' : rate.value >= 30 ? 'warning' : 'default'}
                        value={rate.value}
                      />
                      <p className="mt-1 text-[11px] text-slate-400">{rate.hint}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Verified returns</p>
                    <p className="mt-1 text-2xl font-extrabold text-slate-900">{stats?.verifiedReturns ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Unresolved items</p>
                    <p className="mt-1 text-2xl font-extrabold text-slate-900">{stats?.unresolvedItems ?? 0}</p>
                  </div>
                </div>
              </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="card-surface p-6">
                <div className="mb-5 flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900">Recent matches</h2>
                  <button
                    onClick={() => navigate('/organization/recovery?tab=matches')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:underline"
                  >
                    Review queue <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                {recentMatches.length === 0 ? (
                  <EmptyState
                    compact
                    illustration="🤖"
                    title="No matches yet"
                    description="Matches appear here as soon as LostLink AI pairs a lost report with a find."
                  />
                ) : (
                  <ul className="space-y-2.5">
                    {recentMatches.map((match) => (
                      <li key={match.id}>
                        <button
                          onClick={() => navigate(`/organization/recovery/${match.id}`)}
                          className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-brand-200 hover:bg-brand-50/40"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800">
                              {match.lostReportId} ↔ {match.foundReportId}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                              <StatusBadge status={match.status} />
                              <span className="text-[11px] font-semibold text-slate-400">{scoreLabel(match.finalScore)}</span>
                            </span>
                          </span>
                          <span className={cn(
                            'shrink-0 text-xl font-extrabold tabular-nums',
                            scoreTone(match.finalScore) === 'success' ? 'text-emerald-600' : 'text-amber-600'
                          )}
                          >
                            {match.finalScore}%
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card-surface p-6">
                <div className="mb-5 flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900">Reports by category</h2>
                  <button
                    onClick={() => navigate('/organization/recovery?tab=reports')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:underline"
                  >
                    All reports <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <BreakdownBars
                  items={categoryBreakdown.slice(0, 7)}
                  total={stats?.totalReports}
                  emptyLabel="No reports have been filed in this organization yet."
                />
              </section>
            </div>

            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">Jump to</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {quickLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <button
                      key={link.to}
                      onClick={() => navigate(link.to)}
                      className="card-surface group flex items-center gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-card"
                    >
                      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', link.bg, link.color)}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-800">{link.label}</span>
                        <span className="block truncate text-xs text-slate-500">{link.description}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
                    </button>
                  );
                })}
              </div>
            </section>

            {!isManager && (
              <p className="text-xs text-slate-400">
                Settings and member management are limited to organization owners and admins.
              </p>
            )}
          </div>
        )
      )}
    </div>
  );
}
