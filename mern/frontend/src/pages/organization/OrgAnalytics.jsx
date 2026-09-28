import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  ClipboardList,
  MapPin,
  PackageMinus,
  PackagePlus,
  Percent,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users
} from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { useOrgAnalytics, useOrgUsers } from '../../lib/queries';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';
import { Skeleton, SkeletonStats } from '../../components/ui/Skeleton';
import { Progress } from '../../components/ui/Progress';
import { formatDate, initialsOf, relativeTime } from '../../lib/format';
import { cn } from '../../lib/cn';

const PERIODS = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' }
];

/** Hand-rolled SVG column chart — no chart library, no recharts. */
function ActivityChart({ data = [] }) {
  const points = data.map((d) => ({ label: String(d.label ?? ''), value: Number(d.value) || 0 }));
  if (!points.length) {
    return (
      <EmptyState
        compact
        illustration="📈"
        title="No activity in this window"
        description="Widen the period to see report volume over a longer stretch."
      />
    );
  }

  const max = Math.max(1, ...points.map((p) => p.value));
  const W = 720;
  const H = 200;
  const padTop = 10;
  const plot = H - padTop;
  const slot = W / points.length;
  const barW = Math.max(6, Math.min(44, slot * 0.6));
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const peak = points.reduce((best, p) => (p.value > best.value ? p : best), points[0]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
        <span><strong className="text-slate-800">{total}</strong> reports created</span>
        <span>Peak <strong className="text-slate-800">{peak.label}</strong> ({peak.value})</span>
        <span>Average <strong className="text-slate-800">{Math.round((total / points.length) * 10) / 10}</strong> per bucket</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Report volume, ${total} in total`}>
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={0}
            x2={W}
            y1={padTop + plot - plot * ratio}
            y2={padTop + plot - plot * ratio}
            stroke="#e2e8f0"
            strokeWidth={1}
            strokeDasharray="4 6"
          />
        ))}
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

function DistributionList({ items = [], tone = 'bg-brand-500', emptyLabel }) {
  if (!items.length) return <p className="py-8 text-center text-sm text-slate-500">{emptyLabel}</p>;
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
  const sum = items.reduce((acc, i) => acc + (Number(i.value) || 0), 0);

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const value = Number(item.value) || 0;
        return (
          <li key={item.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-semibold text-slate-700">{item.label}</span>
              <span className="shrink-0 text-xs font-bold tabular-nums text-slate-500">
                {value} · {sum ? Math.round((value / sum) * 100) : 0}%
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.max(value > 0 ? 3 : 0, (value / max) * 100)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * OrgAnalytics — the full organization analytics view.
 * Endpoints: GET /api/analytics/organization?period and GET /api/organizations/:id/users.
 * The period lives in the URL (?period=) so the view is shareable and survives a reload.
 */
export default function OrgAnalytics() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeOrganizationId, activeOrganization } = useOrganization();

  const periodParam = searchParams.get('period');
  const activePeriod = PERIODS.some((p) => p.key === periodParam) ? periodParam : '30d';

  const { data, isLoading, isError, error, refetch } = useOrgAnalytics(activeOrganizationId, activePeriod);
  const { data: membersData, isLoading: membersLoading } = useOrgUsers(activeOrganizationId);

  const stats = data?.stats;
  const members = membersData?.users || [];

  const changePeriod = (key) => {
    setSearchParams({ period: key }, { replace: true });
  };

  const thisPeriod = stats?.thisPeriodReports || 0;
  const previousPeriod = stats?.previousPeriodReports || 0;
  const volumeTrend = previousPeriod
    ? Math.round(((thisPeriod - previousPeriod) / previousPeriod) * 100)
    : (thisPeriod > 0 ? 100 : 0);

  const statusBreakdown = useMemo(
    () => (data?.statusBreakdown || []).slice().sort((a, b) => (b.value || 0) - (a.value || 0)),
    [data?.statusBreakdown]
  );

  const topStaff = useMemo(
    () => members.slice().sort((a, b) => new Date(a.joinedAt || 0) - new Date(b.joinedAt || 0)).slice(0, 6),
    [members]
  );

  return (
    <div>
      <PageHeader
        title="Organization analytics"
        subtitle={`Everything below is computed server-side for ${activeOrganization?.name || 'this organization'}.`}
        actions={(
          <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-soft">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => changePeriod(p.key)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-bold transition',
                  activePeriod === p.key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      />

      {isError && <ErrorState error={error} onRetry={() => refetch()} />}

      {isLoading ? (
        <div className="space-y-6">
          <SkeletonStats count={6} />
          <div className="card-surface p-6">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="mt-4 h-48 w-full" />
          </div>
        </div>
      ) : (
        !isError && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <StatCard
                label="Reports in period"
                value={thisPeriod}
                icon={<ClipboardList className="h-5 w-5" />}
                color="sky"
                trend={volumeTrend}
                description={`${previousPeriod} in the previous period`}
              />
              <StatCard
                label="Lost reports"
                value={stats?.lostReports ?? 0}
                icon={<PackageMinus className="h-5 w-5" />}
                color="amber"
                description="All time in this organization"
              />
              <StatCard
                label="Found reports"
                value={stats?.foundReports ?? 0}
                icon={<PackagePlus className="h-5 w-5" />}
                color="emerald"
                description="All time in this organization"
              />
              <StatCard
                label="Matches"
                value={stats?.matches ?? 0}
                icon={<Sparkles className="h-5 w-5" />}
                color="violet"
                description={`${stats?.highConfidenceMatches ?? 0} high confidence`}
                onClick={() => navigate('/organization/recovery?tab=matches')}
              />
              <StatCard
                label="Verified returns"
                value={stats?.verifiedReturns ?? 0}
                icon={<Percent className="h-5 w-5" />}
                color="indigo"
                description="Completed handovers"
              />
              <StatCard
                label="Unresolved items"
                value={stats?.unresolvedItems ?? 0}
                icon={<Activity className="h-5 w-5" />}
                color="rose"
                description="Neither returned nor closed"
                onClick={() => navigate('/organization/operations?tab=items')}
              />
            </div>

            <section className="card-surface p-6">
              <h2 className="text-base font-bold text-slate-900">Report volume</h2>
              <p className="mb-4 text-sm text-slate-500">
                Bucketed server-side over the selected {PERIODS.find((p) => p.key === activePeriod)?.label.toLowerCase()}.
              </p>
              <ActivityChart data={data?.weeklyActivity || []} />
            </section>

            <div className="grid gap-6 xl:grid-cols-3">
              <section className="card-surface p-6">
                <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
                  <BarChart3 className="h-4 w-4 text-brand-600" /> By category
                </h2>
                <DistributionList
                  items={(data?.categoryBreakdown || []).slice(0, 8)}
                  emptyLabel="No reports have been categorised yet."
                />
              </section>

              <section className="card-surface p-6">
                <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
                  <MapPin className="h-4 w-4 text-sky-600" /> By location
                </h2>
                <DistributionList
                  items={data?.locationBreakdown || []}
                  tone="bg-sky-500"
                  emptyLabel="No locations recorded on reports yet."
                />
              </section>

              <section className="card-surface p-6">
                <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
                  <Activity className="h-4 w-4 text-violet-600" /> By status
                </h2>
                {statusBreakdown.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">No reports to break down yet.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {statusBreakdown.map((row) => (
                      <li key={row.label} className="flex items-center gap-3">
                        <StatusBadge status={row.label} />
                        <div className="flex-1">
                          <Progress
                            color={row.label === 'RETURNED' ? 'success' : row.label === 'REJECTED' ? 'danger' : 'primary'}
                            value={stats?.totalReports ? (row.value / stats.totalReports) * 100 : 0}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-sm font-extrabold tabular-nums text-slate-700">{row.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
              <section className="card-surface p-6">
                <h2 className="mb-1 text-base font-bold text-slate-900">Performance</h2>
                <p className="mb-5 text-sm text-slate-500">How the organization is performing end to end.</p>
                <div className="space-y-5">
                  {[
                    { label: 'Match rate', value: stats?.matchRate ?? 0, hint: 'matches ÷ total reports' },
                    { label: 'Return rate', value: stats?.returnRate ?? 0, hint: 'completed returns ÷ matches' },
                    { label: 'Resolution rate', value: stats?.resolutionRate ?? 0, hint: 'returned ÷ total reports' }
                  ].map((rate) => (
                    <div key={rate.label} className="rounded-xl bg-slate-50 p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-slate-700">{rate.label}</span>
                        <span className="text-2xl font-extrabold tabular-nums text-slate-900">{rate.value}%</span>
                      </div>
                      <Progress
                        className="mt-2"
                        color={rate.value >= 60 ? 'success' : rate.value >= 30 ? 'warning' : 'default'}
                        value={rate.value}
                      />
                      <p className="mt-1.5 text-[11px] text-slate-400">{rate.hint}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm">
                  {volumeTrend >= 0 ? (
                    <TrendingUp className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 shrink-0 text-rose-500" />
                  )}
                  <span className="text-slate-600">
                    {volumeTrend === 0
                      ? 'Report volume is unchanged against the previous period.'
                      : `Report volume is ${volumeTrend > 0 ? 'up' : 'down'} ${Math.abs(volumeTrend)}% against the previous period.`}
                  </span>
                </div>
              </section>

              <section className="card-surface p-6">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                    <Users className="h-4 w-4 text-brand-600" /> Members
                  </h2>
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-bold text-brand-700">
                    {membersLoading ? 'loading…' : `${members.length} people`}
                  </span>
                </div>
                <p className="mb-5 text-sm text-slate-500">
                  The analytics endpoint counts {stats?.members ?? 0} members; the roster below comes from the members endpoint.
                </p>

                {members.length === 0 ? (
                  <EmptyState
                    compact
                    illustration="👥"
                    title="Roster unavailable"
                    description="Member records could not be loaded for this organization."
                  />
                ) : (
                  <ul className="space-y-2.5">
                    {topStaff.map((member) => (
                      <li key={member.id} className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-extrabold text-brand-700">
                          {initialsOf(member.name || member.email)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-800">{member.name || 'Unnamed'}</span>
                          <span className="block truncate text-[11px] text-slate-500">
                            Joined {formatDate(member.joinedAt)} · {relativeTime(member.joinedAt)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold capitalize',
                            member.role === 'owner'
                              ? 'border-violet-200 bg-violet-50 text-violet-700'
                              : member.role === 'admin'
                                ? 'border-brand-200 bg-brand-50 text-brand-700'
                                : member.role === 'staff'
                                  ? 'border-sky-200 bg-sky-50 text-sky-700'
                                  : member.role === 'security'
                                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                                    : 'border-slate-200 bg-slate-100 text-slate-600'
                          )}
                        >
                          {member.role || 'member'}
                        </span>
                      </li>
                    ))}
                    {members.length > topStaff.length && (
                      <li className="pt-1 text-xs text-slate-400">
                        + {members.length - topStaff.length} more member{members.length - topStaff.length === 1 ? '' : 's'}
                      </li>
                    )}
                  </ul>
                )}
              </section>
            </div>
          </div>
        )
      )}
    </div>
  );
}
