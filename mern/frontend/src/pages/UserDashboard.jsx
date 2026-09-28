import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PackageMinus, PackagePlus, Sparkles, PackageCheck, ArrowRight,
  MapPin, Calendar, ChevronRight, ShieldCheck, Bell, Search,
  ClipboardList, CheckCircle2, Circle, ShieldQuestion
} from 'lucide-react';
import { useDashboard } from '../lib/queries';
import { useOrganization } from '../context/OrganizationContext';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import ErrorState from '../components/ErrorState';
import { EmptyStates } from '../components/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { Card, Section } from '../components/ui/Card';
import MatchMeter from '../components/ui/MatchMeter';
import Segmented from '../components/ui/Segmented';
import { formatDate, relativeTime, itemName, RECOVERY_BUCKETS } from '../lib/format';
import { ItemThumb } from '../components/ItemThumb';
import { cn } from '../lib/cn';

/**
 * Home — the member dashboard.
 *
 * Hierarchy, per the dashboard spec:
 *
 *   1  PRIMARY     search the lost & found, or start a report. Nothing else.
 *   2  ATTENTION   the one thing waiting on this person, when there is one
 *                  (a claim to answer, an item ready to collect).
 *   3  MAIN        active matches, then recent reports.
 *   4  SECONDARY   recovery progress, alerts, two headline numbers.
 *
 * The previous revision opened with a gradient hero, then a five-stage pipeline
 * strip, then four metric tiles, then a match card — four summaries before a
 * single actionable row. Every one of those blocks still exists here; they are
 * just ordered by what the page is FOR.
 */

const STAGE_ICONS = [ClipboardList, Sparkles, ShieldQuestion, CheckCircle2, PackageCheck];
const PERIODS = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' }
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function UserDashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('30d');
  const [term, setTerm] = useState('');
  const { activeOrganizationId, activeOrganization } = useOrganization();
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch } = useDashboard(activeOrganizationId, period);

  const recovery = data?.recovery;
  const recoverySteps = useMemo(
    () => (recovery ? RECOVERY_BUCKETS.map((s) => ({ ...s, count: recovery[s.key] ?? 0 })) : []),
    [recovery]
  );

  if (isError) {
    return (
      <div>
        <PageHeader title="Home" />
        <ErrorState error={error} onRetry={refetch} title="We couldn't load your dashboard" />
      </div>
    );
  }

  const stats = data?.stats;
  const matches = data?.topMatches || [];
  const recent = data?.recentReports || [];
  const notifications = data?.notifications || [];
  const name = data?.greeting?.name || user?.name?.split(' ')[0] || 'there';
  const orgName = activeOrganization?.name || data?.organization?.name || 'LostLink AI';

  const pendingVerifications = stats?.pendingVerifications ?? 0;
  const returnedItems = stats?.returnedItems ?? 0;
  const readyForPickup = recovery?.ready ?? 0;

  const submitSearch = (e) => {
    e.preventDefault();
    navigate(term.trim() ? `/search?q=${encodeURIComponent(term.trim())}` : '/search');
  };

  return (
    // `stagger` sequences the four bands of this page — hero, needs-attention,
    // the work area, the rail — so the dashboard assembles instead of blinking
    // into place. Each band's own lists carry `stagger-fast` for their rows.
    <div className="stagger">
      {/* ---- 1. PRIMARY: search, then the two things you can create -------- */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-600 px-5 py-6 shadow-card sm:px-7 sm:py-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.9) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-100">{orgName}</p>
          <h1 className="mt-1 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
            {greeting()}, {name}
          </h1>

          <form onSubmit={submitSearch} className="mt-4 sm:mt-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search for a lost phone, ID card, backpack…"
                aria-label="Search lost and found items"
                className="h-12 w-full rounded-2xl border-0 bg-white pl-11 pr-28 text-sm text-slate-800 shadow-pop outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-white/40"
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1.5 flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-xs font-bold text-white transition hover:bg-brand-500"
              >
                Search
              </button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/report?type=lost"
              className="group flex items-center gap-2.5 rounded-2xl bg-white px-4 py-2.5 shadow-pop transition-all duration-200 ease-spring hover:-translate-y-0.5"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <PackageMinus className="h-4 w-4" />
              </span>
              <span className="text-sm font-extrabold text-brand-ink">Report Lost</span>
            </Link>
            <Link
              to="/report?type=found"
              className="group flex items-center gap-2.5 rounded-2xl bg-white/95 px-4 py-2.5 shadow-pop transition-all duration-200 ease-spring hover:-translate-y-0.5"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-50 text-accent-600">
                <PackagePlus className="h-4 w-4" />
              </span>
              <span className="text-sm font-extrabold text-brand-ink">Report Found</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ---- 2. ATTENTION: the one thing waiting on this person ------------ */}
      {!isLoading && (pendingVerifications > 0 || readyForPickup > 0) && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {pendingVerifications > 0 && (
            <AttentionCard
              tone="warning"
              icon={ShieldCheck}
              title={`${pendingVerifications} claim${pendingVerifications === 1 ? '' : 's'} to answer`}
              body="Prove ownership to release the item for handover."
              actionLabel="Review matches"
              onAction={() => navigate('/matches')}
            />
          )}
          {readyForPickup > 0 && (
            <AttentionCard
              tone="success"
              icon={PackageCheck}
              title={`${readyForPickup} item${readyForPickup === 1 ? '' : 's'} ready to collect`}
              body="Show your one-time pickup code at the desk."
              actionLabel="Open pickup codes"
              onAction={() => navigate('/recovery?tab=returns')}
            />
          )}
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {/* ---- 3. MAIN: matches, then reports ---------------------------- */}
        <div className="space-y-5 xl:col-span-2">
          <Card padding="none">
            <div className="px-5 pt-5">
              <Section
                icon={Sparkles}
                title="Active matches"
                count={stats?.activeMatches ?? matches.length}
                actionLabel="View all"
                onAction={() => navigate('/matches')}
              />
            </div>

            {isLoading ? (
              <div className="space-y-3 px-5 pb-5">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
              </div>
            ) : matches.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyStates.NoMatches onAction={() => navigate('/search')} actionLabel="Search lost & found" />
              </div>
            ) : (
              <ul className="stagger-fast divide-y divide-slate-50">
                {matches.slice(0, 3).map((match) => (
                  <li key={match.id}>
                    <Link
                      to={`/matches/${match.id}`}
                      className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-brand-50/40"
                    >
                      <div className="flex shrink-0 items-center">
                        <ItemThumb report={match.lost} className="h-14 w-14" iconClass="h-5 w-5" />
                        <span className="-ml-2.5 ring-2 ring-white">
                          <ItemThumb report={match.found} className="h-14 w-14" iconClass="h-5 w-5" />
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-brand-ink transition-colors group-hover:text-brand-700">
                          {itemName(match.lost)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {match.lost?.location || 'Unknown'} → {match.found?.location || 'Unknown'}
                        </p>
                        <div className="mt-1.5 max-w-[220px]">
                          <MatchMeter score={match.finalScore} size="sm" />
                        </div>
                      </div>

                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card padding="none">
            <div className="px-5 pt-5">
              <Section
                icon={ClipboardList}
                title="Recent reports"
                count={recent.length}
                actionLabel="My cases"
                onAction={() => navigate('/recovery?tab=cases')}
              />
            </div>

            {isLoading ? (
              <div className="space-y-3 px-5 pb-5">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : recent.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyStates.NoReports onAction={() => navigate('/report?type=lost')} />
              </div>
            ) : (
              <ul className="stagger-fast divide-y divide-slate-50">
                {recent.slice(0, 4).map((r) => (
                  <li key={r.id}>
                    <Link
                      to={`/recovery/${r.id}`}
                      className="group flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-brand-50/40"
                    >
                      <ItemThumb report={r} className="h-11 w-11 text-lg" rounded="rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-800 transition-colors group-hover:text-brand-700">
                          {itemName(r)}
                        </p>
                        <p className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 shrink-0" />{r.location || '—'}
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1">
                            <Calendar className="h-3 w-3" />{formatDate(r.createdAt)}
                          </span>
                        </p>
                      </div>
                      <StatusBadge status={r.status} className="hidden shrink-0 sm:inline-flex" dot={false} />
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ---- 4. SECONDARY: progress, alerts, two numbers ---------------- */}
        <div className="space-y-5">
          <Card>
            <Section
              title="Recovery progress"
              hint="Where your items are right now"
              action={
                <Segmented
                  ariaLabel="Recovery period"
                  size="sm"
                  options={PERIODS}
                  value={period}
                  onChange={setPeriod}
                />
              }
            />

            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9" />)}
              </div>
            ) : (
              <ol className="stagger-fast space-y-1">
                {recoverySteps.map((s, i) => {
                  const Icon = STAGE_ICONS[i] || Circle;
                  const last = i === recoverySteps.length - 1;
                  const reached = s.count > 0;
                  return (
                    <li key={s.key} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          reached
                            ? (last ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-600')
                            : 'bg-slate-100 text-slate-300'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-600">
                        {s.label}
                      </span>
                      <span className={cn(
                        'shrink-0 text-sm font-extrabold tabular-nums',
                        reached ? 'text-brand-ink' : 'text-slate-300'
                      )}>
                        {s.count}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
              <div className="animate-count-in">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Returned</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-brand-ink">{returnedItems}</p>
              </div>
              <div className="animate-count-in" style={{ animationDelay: '60ms' }}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Open cases</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-brand-ink">
                  {(stats?.activeLostReports ?? 0) + (stats?.activeMatches ?? 0)}
                </p>
              </div>
            </div>
          </Card>

          <Card padding="none">
            <div className="px-5 pt-5">
              <Section
                icon={Bell}
                title="Alerts"
                count={stats?.unreadNotifications || undefined}
                actionLabel="View all"
                onAction={() => navigate('/notifications')}
              />
            </div>

            {isLoading ? (
              <div className="space-y-2 px-5 pb-5">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : notifications.length === 0 ? (
              <p className="px-5 pb-6 text-center text-sm text-slate-500">You're all caught up.</p>
            ) : (
              <ul className="stagger-fast divide-y divide-slate-50">
                {notifications.slice(0, 3).map((n) => (
                  <li key={n.id}>
                    <Link to="/notifications" className="block px-5 py-3 transition hover:bg-slate-50">
                      <p className={cn('truncate text-[13px]', n.read ? 'font-semibold text-slate-600' : 'font-bold text-brand-ink')}>
                        {n.title}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{n.message}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{relativeTime(n.createdAt)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/** A single, high-priority call to action. Amber still means "needs a human". */
function AttentionCard({ tone, icon: Icon, title, body, actionLabel, onAction }) {
  const TONES = {
    warning: 'bg-amber-50 text-amber-700',
    success: 'bg-emerald-50 text-emerald-700'
  };
  return (
    <div className="flex items-center gap-3.5 rounded-2xl bg-white p-4 shadow-soft">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONES[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-brand-ink">{title}</p>
        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{body}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={onAction} className="shrink-0">
        {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
