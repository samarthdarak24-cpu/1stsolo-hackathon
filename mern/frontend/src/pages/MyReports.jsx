import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  MapPin, Calendar, Plus, Search, SlidersHorizontal, Package, LayoutGrid, Rows3
} from 'lucide-react';
import { useReports } from '../lib/queries';
import { useOrganization } from '../context/OrganizationContext';
import { useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Collapse } from '../components/ui/Motion';
import StatusBadge from '../components/StatusBadge';
import ErrorState from '../components/ErrorState';
import { EmptyStates } from '../components/EmptyState';
import { SkeletonList } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/Toast';
import { formatDate, itemName, scoreTone } from '../lib/format';
import { ItemThumb } from '../components/ItemThumb';
import { cn } from '../lib/cn';

const TABS = [
  { key: 'ALL', label: 'All' },
  { key: 'LOST', label: 'Lost' },
  { key: 'FOUND', label: 'Found' },
  { key: 'MATCHED', label: 'Matched' },
  { key: 'VERIFYING', label: 'Verification' },
  { key: 'RETURNED', label: 'Returned' },
  { key: 'ARCHIVED', label: 'Archived' }
];

const CATEGORIES = ['All categories', 'Backpack', 'Handbag', 'Water Bottle', 'Laptop', 'Phone', 'Headphones', 'Wallet', 'Keys', 'Watch', 'Umbrella', 'Books', 'ID Card', 'Glasses', 'Charger'];

const STATUS_FOR = {
  MATCHED: ['POTENTIAL_MATCH', 'MATCHED'],
  VERIFYING: ['VERIFICATION_PENDING'],
  RETURNED: ['RETURNED'],
  ARCHIVED: ['CLOSED', 'CANCELLED']
};

export default function MyReports() {
  const { activeOrganizationId, activeOrganization } = useOrganization();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();

  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All categories');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [view, setView] = useState('table');
  const [limit, setLimit] = useState(20);
  const [showFilters, setShowFilters] = useState(false);

  const type = searchParams.get('type') || undefined;

  const params = useMemo(() => ({
    scope: 'mine',
    ...(type && (tab === 'ALL' || tab === type) ? { type } : {}),
    ...(STATUS_FOR[tab] ? { status: STATUS_FOR[tab].join(',') } : {}),
    ...(search ? { search } : {}),
    ...(category !== 'All categories' ? { category } : {}),
    ...(status && !STATUS_FOR[tab] ? { status } : {}),
    ...(from ? { from } : {}),
    limit,
    offset: 0
  }), [tab, search, category, status, from, type, limit]);

  const { data, isLoading, isError, error, refetch, isFetching } = useReports(activeOrganizationId, params);
  const reports = data?.reports || [];
  const total = data?.total || 0;

  const counts = useMemo(() => {
    const map = { ALL: 0, LOST: 0, FOUND: 0, MATCHED: 0, VERIFYING: 0, RETURNED: 0 };
    reports.forEach(r => {
      map.ALL += 1;
      if (r.type === 'LOST') map.LOST += 1;
      if (r.type === 'FOUND') map.FOUND += 1;
      const status = STATUS_FOR.MATCHED.includes(r.status) ? 'MATCHED'
        : STATUS_FOR.VERIFYING.includes(r.status) ? 'VERIFYING'
          : STATUS_FOR.RETURNED.includes(r.status) ? 'RETURNED'
            : STATUS_FOR.ARCHIVED.includes(r.status) ? 'ARCHIVED' : null;
      if (status) map[status] += 1;
    });
    return map;
  }, [reports]);

  const clearFilters = () => {
    setSearch(''); setCategory('All categories'); setStatus(''); setFrom('');
    setSearchParams({});
  };

  const handleDelete = async (report) => {
    try {
      await api.deleteReport(report.id);
      toast.success('Report deleted');
      qc.invalidateQueries({ queryKey: ['reports', activeOrganizationId] });
      qc.invalidateQueries({ queryKey: ['dashboard', activeOrganizationId] });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const activeFilters = (search ? 1 : 0) + (category !== 'All categories' ? 1 : 0) + (status ? 1 : 0) + (from ? 1 : 0) + (type ? 1 : 0);

  return (
    <div>
      <PageHeader
        title="My Reports"
        subtitle={`Every item you've reported in ${activeOrganization?.name || 'your organization'}.`}
        actions={(
          <>
            <Link to="/report?type=found"><Button variant="secondary" size="sm"><Package className="h-4 w-4" /> Report Found</Button></Link>
            <Link to="/report?type=lost"><Button size="sm"><Plus className="h-4 w-4" /> Report Lost Item</Button></Link>
          </>
        )}
      />

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-bold transition',
              tab === t.key ? 'bg-brand-500 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:border-brand-200 hover:text-brand-700'
            )}
          >
            {t.label}
            {counts[t.key] > 0 && <span className={cn('ml-1.5', tab === t.key ? 'text-white/80' : 'text-slate-400')}>{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, brand, colour or location..."
            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm transition focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowFilters(f => !f)}>
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {activeFilters > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">{activeFilters}</span>}
        </Button>
        <div className="hidden items-center gap-1 rounded-full border border-slate-200 bg-white p-1 sm:flex">
          <button onClick={() => setView('table')} className={cn('rounded-full p-1.5', view === 'table' ? 'bg-slate-100 text-slate-800' : 'text-slate-400')} aria-label="Table view">
            <Rows3 className="h-4 w-4" />
          </button>
          <button onClick={() => setView('cards')} className={cn('rounded-full p-1.5', view === 'cards' ? 'bg-slate-100 text-slate-800' : 'text-slate-400')} aria-label="Card view">
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Collapse open={showFilters} className="mb-4">
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
          <label className="text-xs font-bold text-slate-500">
            Category
            <select value={category} onChange={e => setCategory(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-500">
            Status
            <select value={status} onChange={e => setStatus(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100">
              <option value="">Any status</option>
              {['REPORTED', 'POTENTIAL_MATCH', 'MATCHED', 'VERIFICATION_PENDING', 'VERIFIED', 'RETURN_READY', 'RETURNED', 'CLOSED'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-500">
            Reported after
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100" />
          </label>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="text-left text-xs font-bold text-brand-600 hover:underline sm:col-span-3">Clear all filters</button>
          )}
        </div>
      </Collapse>

      {isLoading ? <SkeletonList count={5} /> : isError ? (
        <ErrorState error={error} onRetry={refetch} title="We couldn't load your reports" />
      ) : reports.length === 0 ? (
        activeFilters > 0
          ? <EmptyStates.NoData title="No reports match these filters" description="Try clearing a filter or searching for something else." onAction={clearFilters} actionLabel="Clear filters" />
          : <EmptyStates.NoReports onAction={() => { window.location.hash = '/report?type=lost'; }} />
      ) : (
        <>
          {view === 'table' ? (
            <div className="card-surface overflow-hidden">
              <div className="hidden grid-cols-[2.2fr_1fr_1.4fr_1fr_1.2fr_auto] gap-4 border-b border-slate-200/70 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 lg:grid">
                <span>Item</span><span>Type</span><span>Location</span><span>Date</span><span>AI Match</span><span>Action</span>
              </div>
              <div className="stagger-fast divide-y divide-slate-50">
                {reports.map(r => {
                  const best = r.matches?.[0];
                  return (
                    <div key={r.id} className="grid grid-cols-1 items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50 lg:grid-cols-[2.2fr_1fr_1.4fr_1fr_1.2fr_auto] lg:gap-4">
                      <Link to={`/my-reports/${r.id}`} className="flex min-w-0 items-center gap-3">
                        <ItemThumb report={r} className="h-11 w-11 shrink-0" rounded="rounded-xl" iconClass="h-4 w-4" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-slate-800">{itemName(r)}</span>
                          <span className="block truncate text-xs text-slate-400">{r.reference}</span>
                        </span>
                      </Link>
                      <StatusBadge status={r.type === 'LOST' ? 'REPORTED' : 'FOUND'} label={r.type === 'LOST' ? 'Lost' : 'Found'} tone={r.type === 'LOST' ? 'warning' : 'info'} />
                      <span className="flex items-center gap-1 truncate text-xs text-slate-500"><MapPin className="h-3 w-3 shrink-0" />{r.location}</span>
                      <span className="flex items-center gap-1 text-xs text-slate-500"><Calendar className="h-3 w-3 shrink-0" />{formatDate(r.createdAt)}</span>
                      <span>
                        {best ? (
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold',
                            scoreTone(best.finalScore) === 'success' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700')}>
                            {Math.round(best.finalScore)}%
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <Link to={`/my-reports/${r.id}`} className="text-xs font-bold text-brand-600 hover:underline">View</Link>
                        <StatusBadge status={r.status} className="hidden sm:inline-flex" />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {reports.map(r => (
                <Link key={r.id} to={`/my-reports/${r.id}`} className="card-surface overflow-hidden transition hover:-translate-y-0.5 hover:shadow-card">
                  <ItemThumb report={r} className="h-36 w-full" rounded="rounded-2xl" iconClass="h-10 w-10" />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-bold text-slate-900">{itemName(r)}</p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500"><MapPin className="h-3 w-3" />{r.location}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><Calendar className="h-3 w-3" />{formatDate(r.createdAt)} · {r.reference}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <StatusBadge status={r.type === 'LOST' ? 'REPORTED' : 'FOUND'} label={r.type === 'LOST' ? 'Lost' : 'Found'} tone={r.type === 'LOST' ? 'warning' : 'info'} />
                      {r.matches?.[0] && (
                        <span className="text-xs font-bold text-violet-600">{Math.round(r.matches[0].finalScore)}% match</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {reports.length} of {total} report{total === 1 ? '' : 's'}
              {isFetching && <span className="ml-2 text-slate-400">updating…</span>}
            </p>
            {reports.length >= limit && (
              <Button variant="secondary" size="sm" onClick={() => setLimit(l => l + 20)}>Load more</Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
