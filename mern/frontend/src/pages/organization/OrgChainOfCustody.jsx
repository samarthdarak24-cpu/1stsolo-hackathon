import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, FileClock, History, Link2, MapPin, PackageCheck, Plus, Search, ShieldCheck, X } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { useOrganization } from '../../context/OrganizationContext';
import { useReports, useReturns, useCustody, useAddCustodyRecord } from '../../lib/queries';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import Timeline from '../../components/Timeline';
import ErrorState from '../../components/ErrorState';
import EmptyState, { EmptyStates } from '../../components/EmptyState';
import { Button } from '../../components/ui/Button';
import { SkeletonList } from '../../components/ui/Skeleton';
import { formatDate, formatDateTime, itemName, relativeTime, statusLabel } from '../../lib/format';
import { ItemThumb } from '../../components/ItemThumb';
import { cn } from '../../lib/cn';

/** Mirrors EVENT_LABELS + CUSTODY_EVENTS in the backend, event for event. */
const CUSTODY_EVENT_LABELS = {
  LOGGED: 'Logged into custody',
  STORED: 'Stored',
  MOVED: 'Moved',
  HANDED_TO_STAFF: 'Handed to staff',
  HANDED_OVER: 'Handed over',
  RELEASED: 'Released to owner',
  DISPOSED: 'Disposed',
  NOTE: 'Note'
};

/** Events that move responsibility for the item, so they must name a holder. */
const HANDOFF_EVENTS = ['LOGGED', 'STORED', 'HANDED_TO_STAFF', 'HANDED_OVER', 'RELEASED'];

/**
 * Builds a custody timeline for one report from data that actually exists on the
 * record: the report's own statusHistory, its creation/update stamps, any matches
 * attached to it, and the return case filed against it. Nothing is invented —
 * a step only appears when the server gave us a timestamp for it.
 */
function buildCustodySteps(report, returnCase) {
  const history = Array.isArray(report.statusHistory) ? report.statusHistory : [];
  const matches = Array.isArray(report.matches) ? report.matches : [];
  const bestMatch = matches.slice().sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))[0] || null;
  const timestamps = returnCase?.timestamps || {};

  const firstAt = (predicate) => {
    const entries = history.filter(predicate).map((h) => new Date(h.at).getTime()).filter((t) => !Number.isNaN(t));
    return entries.length ? Math.min(...entries) : null;
  };

  const at = (value) => (value == null || Number.isNaN(new Date(value).getTime()) ? null : value);

  const steps = [];

  steps.push({
    key: 'reported',
    label: 'Reported',
    state: 'done',
    at: report.createdAt,
    detail: `${report.type === 'LOST' ? 'Lost' : 'Found'} report ${report.reference} filed at ${report.location}`
  });

  if (bestMatch) {
    const matchAt = at(bestMatch.createdAt);
    const accepted = ['POTENTIAL_MATCH', 'MATCHED', 'VERIFICATION_PENDING', 'VERIFIED', 'APPROVED'].includes(bestMatch.status);
    steps.push({
      key: 'matched',
      label: 'Candidate match found',
      state: accepted ? 'done' : 'current',
      at: matchAt,
      detail: `Match ${bestMatch.id} at ${bestMatch.finalScore}% confidence — ${statusLabel(bestMatch.status)}`
    });
  }

  const verifiedAt = at(timestamps.verified) || firstAt((h) => h.to === 'VERIFIED');
  if (verifiedAt) {
    steps.push({
      key: 'verified',
      label: 'Ownership verified',
      state: 'done',
      at: verifiedAt,
      detail: 'The claimant proved ownership with report-only details'
    });
  }

  const authorisedAt = at(timestamps.authorized) || firstAt((h) => h.to === 'RETURN_READY');
  if (returnCase || authorisedAt) {
    steps.push({
      key: 'authorised',
      label: 'Return authorised',
      state: returnCase?.status === 'COMPLETED' ? 'done' : 'current',
      at: authorisedAt,
      detail: returnCase
        ? `${statusLabel(returnCase.status)} · pickup at ${returnCase.pickupLocation || 'the desk'}`
        : 'Handover prepared'
    });
  }

  const completedAt = at(timestamps.completed) || at(returnCase?.usedAt) || firstAt((h) => h.to === 'RETURNED');
  if (completedAt) {
    steps.push({
      key: 'completed',
      label: 'Handed back to the owner',
      state: 'done',
      at: completedAt,
      detail: returnCase?.handoverStaffId ? `Completed by staff ${returnCase.handoverStaffId}` : 'Handover completed'
    });
  }

  // The report's own status is the one thing we always know, so it closes the
  // chain even when the server has no separate return case.
  if (!steps.some((s) => s.key === 'completed') && ['RETURNED', 'CLOSED'].includes(report.status)) {
    steps.push({
      key: 'completed',
      label: 'Reported as recovered',
      state: 'done',
      at: report.updatedAt,
      detail: `Report status is ${statusLabel(report.status)}`
    });
  }

  if (!steps.some((s) => s.key === 'verified') && report.status === 'VERIFICATION_PENDING') {
    steps.push({ key: 'verified', label: 'Ownership verification', state: 'current', at: null, detail: 'In progress' });
  }

  return steps;
}

/**
 * OrgChainOfCustody — per-item custody trail assembled from real record data.
 * Endpoints: GET /api/reports?scope=all and GET /api/returns.
 */
export default function OrgChainOfCustody() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { activeOrganizationId } = useOrganization();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(() => searchParams.get('reportId') || null);

  useEffect(() => {
    const fromQuery = searchParams.get('reportId');
    if (fromQuery) setSelectedId(fromQuery);
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const reportsQuery = useReports(activeOrganizationId, { scope: 'all', limit: 200 });
  const returnsQuery = useReturns(activeOrganizationId);
  // One request for the whole ledger of this organization, then grouped per item
  // locally - cheaper than one trail request per row of the list.
  const custodyQuery = useCustody(activeOrganizationId, {});
  const addRecord = useAddCustodyRecord(activeOrganizationId);
  const custodyRecords = custodyQuery.data?.records || [];

  const custodyByReport = useMemo(() => {
    const map = new Map();
    custodyRecords.forEach((record) => {
      const key = String(record.report?.id ?? record.reportId ?? '');
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(record);
    });
    // The API returns them oldest first; keep that order for display.
    map.forEach((list) => list.sort((a, b) => new Date(a.occurredAt || a.createdAt) - new Date(b.occurredAt || b.createdAt)));
    return map;
  }, [custodyRecords]);

  const reports = reportsQuery.data?.reports || [];
  const returns = returnsQuery.data?.returns || [];
  const returnByReport = useMemo(() => {
    const map = new Map();
    returns.forEach((r) => { if (r.reportId && !map.has(r.reportId)) map.set(r.reportId, r); });
    return map;
  }, [returns]);

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reports
      .map((report) => {
        const returnCase = returnByReport.get(report.id) || null;
        const steps = buildCustodySteps(report, returnCase);
        const done = steps.filter((s) => s.state === 'done').length;
        return {
          report,
          returnCase,
          steps,
          records: custodyByReport.get(String(report.id)) || [],
          progress: steps.length ? Math.round((done / steps.length) * 100) : 0,
          lastTouch: report.updatedAt || report.createdAt
        };
      })
      .filter((item) => {
        if (!term) return true;
        return [
          item.report.itemProfile?.itemName,
          item.report.category,
          item.report.location,
          item.report.reference
        ].filter(Boolean).join(' ').toLowerCase().includes(term);
      })
      .sort((a, b) => new Date(b.lastTouch) - new Date(a.lastTouch));
  }, [reports, returnByReport, custodyByReport, search]);

  const selected = items.find((i) => String(i.report.id) === String(selectedId)) || items[0] || null;

  const withReturnCase = items.filter((i) => i.returnCase).length;
  const completed = items.filter((i) => i.report.status === 'RETURNED').length;
  const inProgress = items.filter((i) => !['RETURNED', 'CLOSED'].includes(i.report.status)).length;
  const onLedger = items.filter((i) => i.records.length > 0).length;

  // --- register a custody entry against the selected item -------------------
  const EMPTY_LOG = { event: 'MOVED', toCustodian: '', location: '', note: '' };
  const [logForm, setLogForm] = useState(EMPTY_LOG);
  const submitLog = () => {
    if (!selected) return;
    addRecord.mutate(
      { reportId: selected.report.id, payload: logForm },
      {
        onSuccess: () => {
          toast.success('Custody entry recorded');
          setLogForm(EMPTY_LOG);
        },
        onError: (err) => toast.error(err?.message || 'Could not record that entry')
      }
    );
  };

  const isLoading = reportsQuery.isLoading || returnsQuery.isLoading;
  const isError = reportsQuery.isError || returnsQuery.isError;
  const error = reportsQuery.error || returnsQuery.error;
  const retry = () => { reportsQuery.refetch(); returnsQuery.refetch(); };

  return (
    <div>
      <PageHeader
        title="Chain of custody"
        subtitle="Every timestamp the platform actually holds for an item — status transitions, matches, verification and handover."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tracked items"
          value={items.length}
          icon={<Link2 className="h-5 w-5" />}
          color="sky"
          loading={isLoading}
          description="Reports with a custody trail"
        />
        <StatCard
          label="On the ledger"
          value={onLedger}
          icon={<History className="h-5 w-5" />}
          color="brand"
          loading={custodyQuery.isLoading}
          description={`${custodyRecords.length} entries recorded by staff`}
        />
        <StatCard
          label="Open custody"
          value={inProgress}
          icon={<FileClock className="h-5 w-5" />}
          color="amber"
          loading={isLoading}
          description="Not yet returned or closed"
        />
        <StatCard
          label="Handovers filed"
          value={withReturnCase}
          icon={<PackageCheck className="h-5 w-5" />}
          color="emerald"
          loading={isLoading}
          description={`${completed} already returned to an owner`}
        />
      </div>

      <div className="card-surface mb-5 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search the custody log by item, location or reference…"
            className="w-full rounded-full border border-slate-200 bg-slate-50/70 py-2.5 pl-10 pr-9 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isError && <ErrorState error={error} onRetry={retry} />}

      {isLoading ? (
        <SkeletonList count={5} />
      ) : (
        !isError && (
          items.length === 0 ? (
            <div className="card-surface">
              {search
                ? <EmptyStates.NoSearch term={search} />
                : <EmptyStates.NoReports actionLabel="Report a lost item" onAction={() => navigate('/report?type=lost')} />}
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_1fr]">
              <section className="card-surface overflow-hidden">
                <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                  <p className="text-sm font-bold text-slate-900">Custody items</p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">{items.length}</span>
                </header>
                <ul className="max-h-[70vh] divide-y divide-slate-50 overflow-y-auto scrollbar-thin">
                  {items.map((item) => {
                    const active = String(selected?.report.id) === String(item.report.id);
                    return (
                      <li key={item.report.id}>
                        <button
                          onClick={() => setSelectedId(item.report.id)}
                          className={cn(
                            'flex w-full items-center gap-3 px-5 py-3.5 text-left transition',
                            active ? 'bg-brand-50/70' : 'hover:bg-slate-50'
                          )}
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-lg">
                            <ItemThumb report={item.report} className="h-full w-full" rounded="" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800">{itemName(item.report)}</span>
                            <span className="block truncate text-[11px] text-slate-500">
                              {item.report.reference} · {relativeTime(item.lastTouch)}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <StatusBadge status={item.report.status} />
                            <span className="mt-1 block text-[10px] font-bold text-slate-400">
                              {item.records.length
                                ? `${item.records.length} custody record${item.records.length === 1 ? '' : 's'}`
                                : `${item.steps.length} step${item.steps.length === 1 ? '' : 's'}`}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {selected && (
                <motion.section
                  key={selected.report.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="card-surface p-6"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-extrabold text-slate-900">{itemName(selected.report)}</h2>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="font-mono">{selected.report.reference}</span>
                        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {selected.report.location}</span>
                        <span>{selected.report.type === 'LOST' ? 'Lost report' : 'Found report'}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={selected.report.status} />
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/organization/recovery?tab=reports&reportId=${selected.report.id}`)}>
                        Open report
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Reported', value: formatDate(selected.report.createdAt) },
                      { label: 'Last update', value: formatDate(selected.report.updatedAt) },
                      { label: 'Matches', value: (selected.report.matches || []).length },
                      { label: 'Handover', value: selected.returnCase ? statusLabel(selected.returnCase.status) : 'Not authorised' }
                    ].map((cell) => (
                      <div key={cell.label} className="rounded-xl bg-slate-50 px-3.5 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{cell.label}</p>
                        <p className="mt-1 truncate text-sm font-bold text-slate-800">{cell.value}</p>
                      </div>
                    ))}
                  </div>

                  {selected.report.description && (
                    <p className="mt-5 rounded-xl border border-slate-200 p-4 text-sm leading-relaxed text-slate-600">
                      {selected.report.description}
                    </p>
                  )}

                  <div className="mt-6">
                    <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-400">Custody timeline</h3>
                    <Timeline steps={selected.steps} />
                  </div>

                  {/* ---- registered custody records (the real ledger) -------- */}
                  <div className="mt-6">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-400">
                      <History className="h-3.5 w-3.5" /> Registered custody records
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {selected.records.length}
                      </span>
                    </h3>

                    {custodyQuery.isError ? (
                      <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-xs text-rose-700">
                        The custody ledger could not be loaded: {custodyQuery.error?.message || 'unknown error'}.
                      </p>
                    ) : selected.records.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-xs text-slate-500">
                        No staff member has registered a custody entry for this item yet. Use the form below to record
                        who holds it and where it is kept.
                      </p>
                    ) : (
                      <ol className="space-y-2">
                        {selected.records.map((record) => (
                          <li key={record.id} className="rounded-xl border border-slate-200 px-3.5 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">
                                {record.eventLabel || CUSTODY_EVENT_LABELS[record.event] || record.event}
                              </span>
                              {record.fromCustodian ? (
                                <span className="text-xs text-slate-500">
                                  {record.fromCustodian}
                                  <span className="mx-1 font-bold text-slate-400">→</span>
                                  <span className="font-semibold text-slate-700">{record.toCustodian || 'unassigned'}</span>
                                </span>
                              ) : record.toCustodian ? (
                                <span className="text-xs text-slate-500">
                                  held by <span className="font-semibold text-slate-700">{record.toCustodian}</span>
                                </span>
                              ) : null}
                              {record.location && (
                                <span className="flex items-center gap-1 text-xs text-slate-500">
                                  <MapPin className="h-3.5 w-3.5" /> {record.location}
                                </span>
                              )}
                              <span className="ml-auto text-[11px] text-slate-400">
                                {formatDateTime(record.occurredAt || record.createdAt)}
                              </span>
                            </div>
                            {record.note && <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{record.note}</p>}
                            <p className="mt-1.5 text-[10px] text-slate-400">
                              Logged by {record.actorName || 'system'} · {record.id}
                            </p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <Plus className="h-4 w-4" /> Log a custody entry
                    </h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      Written against <span className="font-mono">{selected.report.reference}</span> and signed by you.
                      The chain is append-only: a mistake is corrected by recording a new entry, never by editing one.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <select
                        value={logForm.event}
                        onChange={(e) => setLogForm({ ...logForm, event: e.target.value })}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-300 focus:outline-none"
                      >
                        {[
                          ['LOGGED', 'Logged into custody'],
                          ['STORED', 'Put into a storage slot'],
                          ['MOVED', 'Moved to a new place'],
                          ['HANDED_TO_STAFF', 'Handed to a staff member'],
                          ['HANDED_OVER', 'Handed to a person / desk'],
                          ['RELEASED', 'Released to the owner'],
                          ['DISPOSED', 'Disposed of'],
                          ['NOTE', 'Note only']
                        ].map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <input
                        value={logForm.toCustodian}
                        onChange={(e) => setLogForm({ ...logForm, toCustodian: e.target.value })}
                        placeholder={HANDOFF_EVENTS.includes(logForm.event)
                          ? 'Who holds it now (required for this event)'
                          : 'Who holds it now (optional for a note or a move)'}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none"
                      />
                      <input
                        value={logForm.location}
                        onChange={(e) => setLogForm({ ...logForm, location: e.target.value })}
                        placeholder="Where it is kept (room, shelf, locker)"
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none"
                      />
                      <input
                        value={logForm.note}
                        onChange={(e) => setLogForm({ ...logForm, note: e.target.value })}
                        placeholder="Anything worth recording"
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none"
                      />
                    </div>
                    {addRecord.isError && (
                      <p className="mt-2 text-xs font-semibold text-rose-600">
                        {addRecord.error?.message || 'That entry could not be recorded.'}
                      </p>
                    )}
                    <div className="mt-3 flex justify-end">
                      <Button size="sm" loading={addRecord.isPending} onClick={submitLog}>
                        Save entry
                      </Button>
                    </div>
                  </div>

                  {selected.steps.length <= 1 && (
                    <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-xs text-slate-500">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      This item has not been matched, verified or handed over yet, so the platform holds nothing
                      beyond the original report.
                    </p>
                  )}

                  {selected.returnCase?.pickupLocation && (
                    <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-xs font-semibold text-emerald-800">
                      <CheckCircle2 className="h-4 w-4" />
                      Pickup point: {selected.returnCase.pickupLocation}
                      {selected.returnCase.qrExpiresAt ? ` · code expires ${formatDateTime(selected.returnCase.qrExpiresAt)}` : ''}
                    </p>
                  )}
                </motion.section>
              )}
            </div>
          )
        )
      )}

      {reportsQuery.data && reportsQuery.data.total > reports.length && (
        <p className="mt-4 text-xs text-slate-400">
          Showing the {reports.length} most recent of {reportsQuery.data.total} reports. Use the search to reach older items.
        </p>
      )}
    </div>
  );
}
