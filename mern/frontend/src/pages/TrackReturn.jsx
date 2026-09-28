import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  FileText,
  MapPin,
  PackageCheck,
  QrCode,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import EmptyState, { EmptyStates } from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import Timeline from '../components/Timeline';
import { Button } from '../components/ui/Button';
import { Skeleton, SkeletonCard } from '../components/ui/Skeleton';
import { useOrganization } from '../context/OrganizationContext';
import { useReturns } from '../lib/queries';
import { cn } from '../lib/cn';
import {
  formatDateTime,
  itemName,
  relativeTime,
  scoreLabel,
  scoreTone
} from '../lib/format';
import { ItemThumb } from '../components/ItemThumb';

/**
 * TrackReturn — the member's recovery board.
 *
 * Every card is a return case the API has already scoped to this user (staff see
 * their own cases unless they hold `return:view-all`). The six-step timeline
 * comes straight from the server so the UI can never disagree with the custody
 * record; the only thing computed here is the QR countdown, which is a pure
 * function of `qrExpiresAt` and the clock.
 */

const CLOSED_STATUSES = ['COMPLETED', 'RETURNED', 'EXPIRED', 'REJECTED', 'CANCELLED'];
const READY_STATUSES = ['READY', 'RETURN_READY'];

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const time = (value) => {
  const t = value ? new Date(value).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

function isExpired(returnObj) {
  const expiry = time(returnObj?.qrExpiresAt);
  return expiry > 0 && expiry <= Date.now();
}

function expiryInfo(qrExpiresAt) {
  if (!qrExpiresAt) return { expired: false, text: 'No pickup code issued' };
  const remaining = time(qrExpiresAt) - Date.now();
  if (remaining <= 0) return { expired: true, text: 'Expired' };
  const totalMinutes = Math.ceil(remaining / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { expired: false, text: `Expires in ${hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}` };
}

function lastActivity(returnObj) {
  const stamps = Object.values(returnObj?.timestamps || {}).map(time).filter(Boolean);
  return Math.max(time(returnObj?.usedAt), time(returnObj?.qrExpiresAt), ...stamps, 0) || null;
}

/** Cheap re-render clock so the countdown text never goes stale on a long visit. */
function useClockTick(intervalMs = 30000) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}

export default function TrackReturn() {
  const navigate = useNavigate();
  const { activeOrganizationId } = useOrganization();
  const orgId = activeOrganizationId;

  const tick = useClockTick();

  const { data, error, refetch, isFetching } = useReturns(orgId);

  const returns = useMemo(
    () => (Array.isArray(data?.returns) ? data.returns : []),
    [data]
  );

  const showSkeleton = !data && !error;

  const { active, completed, stats } = useMemo(() => {
    const open = returns.filter((r) => !CLOSED_STATUSES.includes(r.status));
    const done = returns.filter((r) => CLOSED_STATUSES.includes(r.status));
    return {
      active: open,
      completed: done,
      stats: {
        active: open.length,
        ready: open.filter((r) => READY_STATUSES.includes(r.status) && !isExpired(r)).length,
        completed: done.filter((r) => r.status === 'COMPLETED' || r.status === 'RETURNED').length
      }
    };
    // `tick` re-derives the expiry-based counts as the clock advances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returns, tick]);

  const isEmpty = !showSkeleton && !error && returns.length === 0;

  return (
    <div className="stagger">
      <PageHeader
        title="Track Return"
        subtitle="Follow your item from report to verified handover"
        badge={!showSkeleton && !error && !isEmpty ? (
          <StatusBadge
            tone="primary"
            icon={PackageCheck}
            label={`${returns.length} case${returns.length === 1 ? '' : 's'}`}
          />
        ) : null}
        actions={(
          <>
            <Button variant="secondary" onClick={() => navigate('/recovery?tab=cases')}>
              <FileText className="h-4 w-4" /> View my reports
            </Button>
            <Button onClick={() => navigate('/matches')}>
              <Sparkles className="h-4 w-4" /> AI matches
            </Button>
          </>
        )}
      />

      {showSkeleton ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Active returns"
            value={stats.active}
            icon={<PackageCheck className="h-5 w-5" />}
            color="emerald"
            description="Still moving towards handover"
          />
          <StatCard
            label="Ready for pickup"
            value={stats.ready}
            icon={<QrCode className="h-5 w-5" />}
            color="sky"
            description="Live one-time QR available"
          />
          <StatCard
            label="Completed"
            value={stats.completed}
            icon={<ShieldCheck className="h-5 w-5" />}
            color="violet"
            description="Handed back to their owner"
          />
        </div>
      )}

      {isEmpty && (
        <div className="card-surface mt-5">
          <EmptyStates.NoReturns onAction={() => navigate('/recovery?tab=cases')} />
        </div>
      )}

      {error && <ErrorState error={error} onRetry={() => refetch()} className="mt-5" />}

      {showSkeleton && (
        <div className="mt-5 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-surface grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
              <div className="p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-16 w-16 rounded-2xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
              <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 p-5 sm:p-6 lg:border-l lg:border-t-0">
                {[0, 1, 2, 3].map((s) => <Skeleton key={s} className="h-6 w-full" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {!showSkeleton && !error && !isEmpty && (
        <div className="mt-5 space-y-8">
          {isFetching && <p className="text-xs text-slate-400">Refreshing your returns…</p>}

          {active.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-slate-500">
                Active recoveries
              </h2>
              <div className="stagger-fast space-y-4">
                {active.map((r) => <ReturnCard key={r.id} returnObj={r} onOpenQr={() => navigate(`/track-return/${r.id}/qr`)} onViewReport={() => navigate(`/my-reports/${r.reportId}`)} />)}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-slate-500">
                Completed returns
              </h2>
              <div className="stagger-fast space-y-4">
                {completed.map((r) => <ReturnCard key={r.id} returnObj={r} onOpenQr={() => navigate(`/track-return/${r.id}/qr`)} onViewReport={() => navigate(`/my-reports/${r.reportId}`)} />)}
              </div>
            </section>
          )}
        </div>
      )}

      {!showSkeleton && !error && (
        <p className="mt-6 text-xs text-slate-500">
          Pickup codes are single-use and expire automatically. Staff scan your code at the pickup
          point to complete the handover — never share it with anyone else.
        </p>
      )}
    </div>
  );
}

function ReturnCard({ returnObj, onOpenQr, onViewReport }) {
  const report = returnObj?.report;
  const expiry = expiryInfo(returnObj?.qrExpiresAt);
  const timelineSteps = useMemo(
    () => (Array.isArray(returnObj?.timeline) ? returnObj.timeline : [])
      .map((step) => ({ label: step.label, at: step.at, state: step.state })),
    [returnObj]
  );
  const last = lastActivity(returnObj);
  const isReady = READY_STATUSES.includes(returnObj?.status) && !expiry.expired;
  const verified = returnObj?.verification?.status === 'VERIFIED' || Boolean(returnObj?.verifiedUserId);
  const matchScore = num(returnObj?.match?.finalScore);

  return (
    <article className="card-surface overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-brand-50/50">
              <ItemThumb report={report} className="h-full w-full" rounded="" iconClass="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{itemName(report)}</h3>
                <StatusBadge status={returnObj?.status} />
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                {returnObj?.organization?.name || 'Organization'}
                {report?.reference && <span className="font-mono text-slate-400">· {report.reference}</span>}
              </p>
            </div>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Fact icon={<MapPin className="h-3.5 w-3.5" />} label="Pickup location" value={returnObj?.pickupLocation || 'To be confirmed by staff'} />
            <Fact
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              label="Last update"
              value={last ? `${relativeTime(last) || 'just now'} · ${formatDateTime(last)}` : '—'}
            />
            {returnObj?.instructions && (
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Instructions</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-slate-600">{returnObj.instructions}</dd>
              </div>
            )}
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {verified && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                <ShieldCheck className="h-3 w-3" /> Owner verified
              </span>
            )}
            {returnObj?.match && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold',
                  scoreTone(matchScore) === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : scoreTone(matchScore) === 'warning'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                )}
              >
                <Sparkles className="h-3 w-3" />
                Match {matchScore.toFixed(1)}% · {scoreLabel(matchScore)}
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/50 p-5 sm:p-6 lg:border-l lg:border-t-0">
          {timelineSteps.length > 0 ? (
            <Timeline steps={timelineSteps} />
          ) : (
            <EmptyState
              compact
              illustration="📋"
              title="No recovery timeline"
              description="This case has no recorded stages yet."
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold uppercase tracking-wider text-slate-400">Pickup code</span>
          {returnObj?.qrExpiresAt ? (
            <span className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
              expiry.expired
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-sky-200 bg-sky-50 text-sky-700'
            )}
            >
              {expiry.text}
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-slate-400">{expiry.text}</span>
          )}
          {returnObj?.usedAt && (
            <span className="text-[11px] text-slate-400">· used {relativeTime(returnObj.usedAt)}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isReady ? (
            <Button size="sm" onClick={onOpenQr}>
              <QrCode className="h-4 w-4" /> View QR
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={onOpenQr}>
              View details
            </Button>
          )}
          {returnObj?.reportId && (
            <Button size="sm" variant="ghost" onClick={onViewReport}>
              <FileText className="h-4 w-4" /> View report
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function Fact({ icon, label, value }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-700">{value}</dd>
    </div>
  );
}
