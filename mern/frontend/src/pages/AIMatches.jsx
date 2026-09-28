import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpDown,
  CalendarDays,
  Info,
  MapPin,
  PackageMinus,
  PackagePlus,
  Search,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import EmptyState, { EmptyStates } from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { Button } from '../components/ui/Button';
import { SkeletonCard, SkeletonStats } from '../components/ui/Skeleton';
import { useOrganization } from '../context/OrganizationContext';
import { useMatches } from '../lib/queries';
import { cn } from '../lib/cn';
import { formatDate, itemName, scoreLabel, scoreTone } from '../lib/format';
import { ItemThumb } from '../components/ItemThumb';

/**
 * AIMatches — the member-facing list of AI candidate matches.
 *
 * The list is org-scoped by the API, so every card here is a match the signed-in
 * user is a party to (members) or is allowed to supervise (staff). Filtering,
 * search and sorting all happen client-side on the already-scoped payload so a
 * member never sees another tenant's candidate.
 */

const MATCH_PARAMS = { limit: 50 };
const HIGH_CONFIDENCE = 85;

const REVIEW_STATUSES = ['MANUAL_REVIEW', 'PENDING_VERIFICATION', 'PENDING', 'REVIEW'];
const VERIFIED_STATUSES = ['VERIFIED', 'APPROVED'];
const CLOSED_STATUSES = ['REJECTED', 'EXPIRED', 'CANCELLED'];
const VERIFIABLE_STATUSES = ['PENDING_VERIFICATION', 'MANUAL_REVIEW', 'PENDING', 'REVIEW'];

const TABS = [
  { key: 'ALL', label: 'All', test: () => true },
  { key: 'HIGH', label: 'High Confidence', test: (m) => score(m) >= HIGH_CONFIDENCE },
  { key: 'REVIEW', label: 'Needs Review', test: (m) => REVIEW_STATUSES.includes(m.status) },
  { key: 'VERIFIED', label: 'Verified', test: (m) => VERIFIED_STATUSES.includes(m.status) },
  { key: 'CLOSED', label: 'Closed', test: (m) => CLOSED_STATUSES.includes(m.status) }
];

const SORTS = [
  { key: 'score', label: 'Highest score' },
  { key: 'newest', label: 'Newest' }
];

const CHIP_TONE = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  default: 'border-slate-200 bg-slate-100 text-slate-600'
};

const INPUT_CLASS =
  'w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-100';

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const score = (m) => num(m?.finalScore);
const time = (value) => (value ? new Date(value).getTime() : 0);

/* Evidence rows are normalised so both the current signal set and older
   `{ type, details }` rows render without a special case. */
const evidenceKey = (e, i) => e?.key || e?.type || `signal-${i}`;
const evidenceLabel = (e) => {
  if (e?.label) return e.label;
  const raw = e?.type || e?.key;
  if (!raw) return 'Signal';
  const text = String(raw).replace(/[_-]+/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const evidenceWeight = (e) => (typeof e?.weight === 'number' ? e.weight : 1);

function topEvidence(match, limit = 3) {
  const rows = Array.isArray(match?.evidence) ? match.evidence : [];
  return rows
    .map((e, i) => ({ e, key: evidenceKey(e, i) }))
    .sort((a, b) => num(b.e?.score) * evidenceWeight(b.e) - num(a.e?.score) * evidenceWeight(a.e))
    .slice(0, limit);
}

function searchBlob(match) {
  const parts = [
    itemName(match?.lost),
    itemName(match?.found),
    match?.lost?.category,
    match?.found?.category,
    match?.lost?.location,
    match?.found?.location,
    match?.lost?.itemProfile?.brand,
    match?.found?.itemProfile?.brand
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export default function AIMatches() {
  const navigate = useNavigate();
  const { activeOrganizationId } = useOrganization();
  const orgId = activeOrganizationId;

  const [tab, setTab] = useState('ALL');
  const [sort, setSort] = useState('score');
  const [term, setTerm] = useState('');

  const { data, error, refetch, isFetching } = useMatches(orgId, MATCH_PARAMS);

  const matches = useMemo(() => (Array.isArray(data?.matches) ? data.matches : []), [data]);
  const showSkeleton = !data && !error;
  const isEmpty = !showSkeleton && !error && matches.length === 0;

  const stats = useMemo(() => ({
    total: matches.length,
    high: matches.filter((m) => score(m) >= HIGH_CONFIDENCE).length,
    review: matches.filter((m) => REVIEW_STATUSES.includes(m.status)).length,
    verified: matches.filter((m) => VERIFIED_STATUSES.includes(m.status)).length
  }), [matches]);

  const tabCounts = useMemo(() => {
    const counts = {};
    TABS.forEach((t) => { counts[t.key] = matches.filter(t.test).length; });
    return counts;
  }, [matches]);

  const visible = useMemo(() => {
    const active = TABS.find((t) => t.key === tab) || TABS[0];
    const needle = term.trim().toLowerCase();
    const filtered = matches.filter((m) => (
      active.test(m) && (!needle || searchBlob(m).includes(needle))
    ));
    return filtered.sort((a, b) => (
      sort === 'newest' ? time(b?.createdAt) - time(a?.createdAt) : score(b) - score(a)
    ));
  }, [matches, tab, term, sort]);

  const resetFilters = () => { setTab('ALL'); setSort('score'); setTerm(''); };
  const hasFilters = tab !== 'ALL' || sort !== 'score' || term.trim().length > 0;

  return (
    <div>
      <PageHeader
        title="AI Matches"
        subtitle="Potential matches identified by LostLink AI"
        badge={!showSkeleton && !error ? (
          <StatusBadge tone="primary" icon={Sparkles} label={`${stats.total} candidate${stats.total === 1 ? '' : 's'}`} />
        ) : null}
        actions={(
          <>
            <Button variant="secondary" onClick={() => navigate('/report?type=found')}>
              <PackagePlus className="h-4 w-4" /> Report found item
            </Button>
            <Button onClick={() => navigate('/report?type=lost')}>
              <PackageMinus className="h-4 w-4" /> Report lost item
            </Button>
          </>
        )}
      />

      {showSkeleton ? (
        <SkeletonStats count={4} />
      ) : (
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total matches"
            value={stats.total}
            icon={<Sparkles className="h-5 w-5" />}
            color="emerald"
            description="Candidate pairs found by matching"
            onClick={() => setTab('ALL')}
          />
          <StatCard
            label="High confidence"
            value={stats.high}
            icon={<ShieldCheck className="h-5 w-5" />}
            color="sky"
            description={`Scored ${HIGH_CONFIDENCE}% or higher`}
            onClick={() => setTab('HIGH')}
          />
          <StatCard
            label="Needs review"
            value={stats.review}
            icon={<Info className="h-5 w-5" />}
            color="amber"
            description="Awaiting a human decision"
            onClick={() => setTab('REVIEW')}
          />
          <StatCard
            label="Verified"
            value={stats.verified}
            icon={<PackagePlus className="h-5 w-5" />}
            color="violet"
            description="Ownership confirmed"
            onClick={() => setTab('VERIFIED')}
          />
        </div>
      )}

      {!showSkeleton && !error && !isEmpty && (
        <>
          <div className="card-surface mt-5 flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 lg:mx-0 lg:px-0">
              {TABS.map((t) => {
                const active = t.key === tab;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    aria-pressed={active}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-bold transition',
                      active
                        ? 'border-brand-200 bg-brand-50 text-brand-700'
                        : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                    )}
                  >
                    {t.label}
                    <span className={cn('tabular-nums', active ? 'text-brand-600' : 'text-slate-400')}>
                      {tabCounts[t.key] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Search item, brand or location"
                  aria-label="Search matches by item, brand or location"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="relative sm:w-48">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  aria-label="Sort matches"
                  className="w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-9 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                >
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
                <ArrowUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Showing <span className="font-bold text-slate-700">{visible.length}</span> of{' '}
            {matches.length} {matches.length === 1 ? 'candidate' : 'candidates'}
            {isFetching && <span className="ml-2 text-slate-400">Updating…</span>}
          </p>
        </>
      )}

      {!showSkeleton && !error && (
        <div className="mt-4">
          {isEmpty ? (
            <div className="card-surface">
              <EmptyStates.NoMatches onAction={() => navigate('/recovery?tab=cases')} />
            </div>
          ) : visible.length === 0 ? (
            <div className="card-surface">
              <EmptyState
                illustration="🔎"
                title="No matches match these filters"
                description="Loosen the confidence filter, clear the search term, or switch back to All to see the rest of the candidates."
                actionLabel="Clear filters"
                onAction={resetFilters}
              />
            </div>
          ) : (
            <div className="stagger-fast space-y-4">
              {visible.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  onOpen={() => navigate(`/matches/${match.id}`)}
                  onVerify={() => navigate(`/matches/${match.id}/verify`)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!showSkeleton && !error && (
        <p className="mt-6 flex items-start gap-2 rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-xs text-slate-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span>
            An AI match is a candidate recommendation, not proof of ownership. Ownership is only
            confirmed after a verification challenge, and the item is only released after a secure
            handover at the pickup point.
          </span>
        </p>
      )}

      {showSkeleton && (
        <div className="stagger-fast mt-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {error && (
        <ErrorState error={error} onRetry={() => refetch()} className="mt-6" />
      )}
    </div>
  );
}

function MatchCard({ match, onOpen, onVerify }) {
  const tone = scoreTone(match?.finalScore);
  const canVerify = Boolean(match?.isMine) && VERIFIABLE_STATUSES.includes(match?.status);
  const evidence = topEvidence(match);

  return (
    <article className="card-surface overflow-hidden transition hover:shadow-card">
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center">
          <SideItem report={match?.lost} caption="Reported lost" />
          <div className="hidden shrink-0 sm:flex sm:items-center">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-extrabold tracking-wide text-slate-400">VS</span>
          </div>
          <SideItem report={match?.found} caption="Reported found" />
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-slate-100 lg:w-52 lg:items-stretch lg:border-l lg:pl-5">
          <div className={cn('rounded-2xl border px-4 py-3 text-center', CHIP_TONE[tone] || CHIP_TONE.default)}>
            <p className="text-3xl font-extrabold leading-none tabular-nums tracking-tight">
              {score(match).toFixed(1)}%
            </p>
            <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.16em] opacity-70">Match</p>
            <p className="mt-1 text-[11px] font-bold">{scoreLabel(match?.finalScore)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-center">
            <StatusBadge status={match?.status} />
            {match?.isMine && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                Your item
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Top signals</span>
          {evidence.length === 0 ? (
            <span className="text-xs text-slate-400">No signal breakdown stored for this candidate.</span>
          ) : evidence.map(({ e, key }) => (
            <span
              key={key}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700"
            >
              {evidenceLabel(e)}
              <span className="tabular-nums text-brand-600">{num(e?.score).toFixed(0)}%</span>
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onOpen}>Review match</Button>
          {canVerify && (
            <Button size="sm" variant="outline" onClick={onVerify}>
              Verify ownership
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function SideItem({ report, caption }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-brand-50/50">
        <ItemThumb report={report} className="h-full w-full" rounded="" iconClass="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{caption}</p>
        <p className="truncate text-sm font-bold text-slate-900">{itemName(report)}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{report?.location || 'Location not shared'}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
          <CalendarDays className="h-3 w-3 shrink-0" />
          {formatDate(report?.createdAt)}
        </p>
      </div>
    </div>
  );
}
