import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search as SearchIcon, SlidersHorizontal, X, Sparkles, MapPin, Calendar,
  Tag, Palette, Ruler, Hash, Info, ArrowRight, Loader2, PackageSearch
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import Sheet from '../components/ui/Sheet';
import ItemCard from '../components/ui/ItemCard';
import MatchMeter from '../components/ui/MatchMeter';
import Segmented from '../components/ui/Segmented';
import { Button } from '../components/ui/Button';
import { SkeletonGallery } from '../components/ui/Skeleton';
import { useDiscovery } from '../lib/queries';
import { resolveUrl } from '../lib/api';
import { useOrganization } from '../context/OrganizationContext';
import {
  formatDate, itemName, ITEM_CATEGORIES, SEARCH_SUGGESTIONS
} from '../lib/format';
import { cn } from '../lib/cn';

/**
 * Search — visual discovery across the organization's lost & found.
 *
 * Design contract (search spec):
 *  - ONE large input. It is the primary action on the screen, so it dominates.
 *  - Results are VISUAL ITEM CARDS. A card carries image, name, type, date,
 *    location, status and a match band — never the item description. A wall of
 *    prose is what made the previous list unreadable.
 *  - Complexity is hidden. Category / status / date / location live behind a
 *    Filters toggle; the description lives in the detail drawer.
 *
 * Backing it is the org-scoped `/api/search` endpoint, which matches on
 * description, category, location, reference, item name, brand, colour and
 * visible mark, and returns the organization's LOST and FOUND reports — so a
 * member can answer "is my item already in lost & found?" without staff help.
 */

const TYPE_OPTIONS = [
  { value: 'ALL', label: 'Everything' },
  { value: 'FOUND', label: 'Found items' },
  { value: 'LOST', label: 'Lost reports' }
];

const DATE_OPTIONS = [
  { value: 'ANY', label: 'Any time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' }
];

const daysAgo = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Date.now() - n * 86400000 : null;
};

export default function SearchPage() {
  const navigate = useNavigate();
  const { activeOrganizationId, activeOrganization } = useOrganization();

  // A dashboard search lands here with `?q=` already filled in.
  const [searchParams] = useSearchParams();
  const [term, setTerm] = useState(() => searchParams.get('q') || '');
  const [type, setType] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [within, setWithin] = useState('ANY');
  const [location, setLocation] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState(null);

  // Typing stays responsive: the query only re-runs against the settled value.
  const settled = useDeferredValue(term.trim());
  const ready = settled.length >= 2;

  const { data, isFetching, error, refetch } = useDiscovery(activeOrganizationId, settled);

  const lost = data?.lostReports || [];
  const found = data?.foundReports || [];
  const matches = data?.matches || [];

  const results = useMemo(() => {
    const rows = [...lost, ...found];
    const cutoff = daysAgo(within);
    const needle = location.trim().toLowerCase();

    return rows
      .filter((r) => (type === 'ALL' ? true : r.type === type))
      .filter((r) => (category === 'ALL' ? true : r.category === category))
      .filter((r) => (status === 'ALL' ? true : r.status === status))
      .filter((r) => (cutoff ? new Date(r.createdAt).getTime() >= cutoff : true))
      .filter((r) => (needle ? String(r.location || '').toLowerCase().includes(needle) : true))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [lost, found, type, category, status, within, location]);

  const statusOptions = useMemo(() => {
    const seen = new Set();
    [...lost, ...found].forEach((r) => r.status && seen.add(r.status));
    return ['ALL', ...Array.from(seen).sort()];
  }, [lost, found]);

  const activeFilters = [type !== 'ALL', category !== 'ALL', status !== 'ALL', within !== 'ANY', Boolean(location.trim())]
    .filter(Boolean).length;

  const clearFilters = () => {
    setType('ALL'); setCategory('ALL'); setStatus('ALL'); setWithin('ANY'); setLocation('');
  };

  const runSuggestion = (value) => { setTerm(value); setSelected(null); };

  return (
    <div>
      {/* ---- PRIMARY ACTION: the search field ---------------------------- */}
      <section className="mx-auto max-w-3xl text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">
          {activeOrganization?.name || 'Your organization'}
        </p>
        <h1 className="mt-1.5 text-xl font-extrabold tracking-tight text-brand-ink sm:text-2xl">
          Search lost &amp; found
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Type what you lost. LostLink reads names, brands, colours and places.
        </p>
      </section>

      <div className="mx-auto mt-5 max-w-3xl">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search for a lost phone, ID card, backpack…"
            aria-label="Search lost and found items"
            autoComplete="off"
            className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-12 text-[15px] text-slate-800 shadow-soft transition placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
          {isFetching && (
            <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-500" />
          )}
          {!isFetching && term && (
            <button
              type="button"
              onClick={() => setTerm('')}
              aria-label="Clear search"
              className="absolute right-3.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Suggestion chips: an empty search box is a dead end, so it always
            offers somewhere to go. */}
        {!ready && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SEARCH_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => runSuggestion(s)}
                className="rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-slate-600 shadow-xs transition hover:-translate-y-0.5 hover:text-brand-700 hover:shadow-soft"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {ready && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Segmented
              ariaLabel="Result type"
              size="sm"
              options={TYPE_OPTIONS}
              value={type}
              onChange={setType}
            />
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowFilters((f) => !f)}
                aria-expanded={showFilters}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeFilters > 0 && (
                  <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{activeFilters}</span>
                )}
              </Button>
            </div>
          </div>
        )}

        {ready && showFilters && (
          <div className="mt-3 grid gap-3 rounded-2xl bg-white p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="field-label">Category</span>
              <select className="select-base" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="ALL">All categories</option>
                {ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Status</span>
              <select className="select-base" value={status} onChange={(e) => setStatus(e.target.value)}>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s === 'ALL' ? 'Any status' : s.replace(/_/g, ' ').toLowerCase()}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Reported</span>
              <select className="select-base" value={within} onChange={(e) => setWithin(e.target.value)}>
                {DATE_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Location contains</span>
              <input
                className="input-base"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. library"
              />
            </label>
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-left text-xs font-bold text-brand-600 hover:underline sm:col-span-2 lg:col-span-4"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---- RESULTS ------------------------------------------------------ */}
      <div className="mx-auto mt-6 max-w-6xl">
        {error ? (
          <ErrorState error={error} onRetry={refetch} title="Search is unavailable right now" />
        ) : !ready ? (
          <EmptyState
            icon={PackageSearch}
            title="Start typing to search"
            description="LostLink searches every lost and found item in this organization — nothing leaves it."
          />
        ) : isFetching && results.length === 0 ? (
          <SkeletonGallery count={6} />
        ) : results.length === 0 ? (
          <EmptyStates.NoSearch
            term={settled}
            onAction={activeFilters > 0 ? clearFilters : () => navigate('/report?type=lost')}
            actionLabel={activeFilters > 0 ? 'Clear filters' : 'Report it as lost'}
          />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-slate-500">
                <span className="font-bold text-brand-ink">{results.length}</span>
                {results.length === 1 ? ' item' : ' items'} for “{settled}”
              </p>
              {isFetching && <span className="text-xs text-slate-400">Updating…</span>}
            </div>

            <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((report) => (
                <ItemCard
                  key={`${report.type}-${report.id}`}
                  report={report}
                  onOpen={() => setSelected(report)}
                />
              ))}
            </div>
          </>
        )}

        {/* Possible matches are a different kind of answer ("these two may be the
            same item"), so they sit in their own block rather than being mixed
            into the item grid. */}
        {ready && matches.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-brand-ink">
              <Sparkles className="h-4 w-4 text-brand-600" />
              AI candidate matches
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-500">
                {matches.length}
              </span>
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {matches.map(({ match, lost: l, found: f }) => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => navigate(`/matches/${match.id}`)}
                  className="flex items-center gap-4 rounded-2xl bg-white p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-brand-ink">
                      {itemName(l)} ↔ {itemName(f)}
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {l?.location || '—'} · {f?.location || '—'}
                    </span>
                    <span className="mt-2 block">
                      <MatchMeter score={match.finalScore} size="sm" />
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <SearchDetail
        report={selected}
        onClose={() => setSelected(null)}
        onOpen={() => navigate(`/recovery/${selected.id}`)}
        onClaim={() => navigate('/report?type=lost')}
      />
    </div>
  );
}

/**
 * The tier-2/3/4 detail for one item, in a drawer so the result grid stays put.
 */
function SearchDetail({ report, onClose, onOpen, onClaim }) {
  if (!report) return <Sheet open={false} onClose={onClose} />;
  const profile = report.itemProfile || {};
  const isLost = report.type === 'LOST';

  const facts = [
    { icon: Tag, label: 'Category', value: profile.category || report.category },
    { icon: Palette, label: 'Colour', value: [profile.primaryColor, profile.secondaryColor].filter(Boolean).join(' / ') },
    { icon: Tag, label: 'Brand', value: profile.brand },
    { icon: Ruler, label: 'Material', value: profile.material },
    { icon: Hash, label: 'Serial', value: profile.serialNumber },
    { icon: Info, label: 'Visible mark', value: profile.visibleMark }
  ].filter((f) => f.value);

  return (
    <Sheet
      open
      onClose={onClose}
      title={itemName(report)}
      subtitle={`${isLost ? 'Lost' : 'Found'} · ${report.reference || report.id}`}
      footer={
        <>
          <Button variant="secondary" onClick={onOpen}>Open full report</Button>
          {!isLost && (
            <Button onClick={onClaim}>This is mine</Button>
          )}
        </>
      }
    >
      <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-100">
        <ItemImage report={report} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={report.status} />
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-bold',
            isLost ? 'bg-amber-50 text-amber-700' : 'bg-accent-50 text-accent-700'
          )}
        >
          {isLost ? 'Reported lost' : 'In lost & found'}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Fact icon={MapPin} label="Location" value={report.location || 'Not shared'} />
        <Fact icon={Calendar} label="Reported" value={formatDate(report.createdAt)} />
      </dl>

      {report.description && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Description</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{report.description}</p>
        </div>
      )}

      {facts.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Recognised attributes</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            {facts.map((f) => <Fact key={f.label} icon={f.icon} label={f.label} value={f.value} />)}
          </dl>
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        Ownership is never decided here. Claiming an item starts a private verification challenge.
      </p>
    </Sheet>
  );
}

function ItemImage({ report }) {
  const src = resolveUrl((report.images || []).find(Boolean));
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <PackageSearch className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={itemName(report)}
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

function Fact({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
        <Icon className="h-3 w-3" /> {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-semibold capitalize text-slate-700">{value}</dd>
    </div>
  );
}
