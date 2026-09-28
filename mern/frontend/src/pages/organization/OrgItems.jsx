import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Boxes, ExternalLink, History, Loader2, MapPin, PackageCheck, Search, Shield, User, X } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { useCustody, useReports } from '../../lib/queries';
import api from '../../lib/api';
import { useToast } from '../../components/Toast';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import ErrorState from '../../components/ErrorState';
import { EmptyStates } from '../../components/EmptyState';
import { SkeletonList } from '../../components/ui/Skeleton';
import { itemName, relativeTime, statusLabel } from '../../lib/format';
import { ItemThumb } from '../../components/ItemThumb';
import { cn } from '../../lib/cn';

const LOST_FLOW = ['REPORTED', 'MATCHING', 'POTENTIAL_MATCH', 'VERIFICATION_PENDING', 'VERIFIED', 'RETURN_READY', 'RETURNED', 'CLOSED'];
const FOUND_FLOW = ['FOUND', 'MATCHING', 'MATCHED', 'VERIFIED', 'RETURNED', 'CLOSED'];
const STAFF_STATUS_CHANGES = ['MATCHING', 'POTENTIAL_MATCH', 'VERIFICATION_PENDING', 'VERIFIED', 'RETURN_READY', 'RETURNED', 'CLOSED'];

/* Custody lanes. Every bucket is derived from real report statuses — a lane is
   simply hidden when the organization has nothing sitting in it. */
const LANES = [
  {
    key: 'intake',
    title: 'New intake',
    blurb: 'Just reported, no matching run yet.',
    statuses: ['REPORTED', 'FOUND'],
    icon: Boxes,
    tone: 'border-slate-200',
    chip: 'bg-slate-100 text-slate-600'
  },
  {
    key: 'matching',
    title: 'Being matched',
    blurb: 'LostLink AI is comparing these against the other reports.',
    statuses: ['MATCHING', 'MATCHED', 'POTENTIAL_MATCH'],
    icon: Loader2,
    tone: 'border-violet-200',
    chip: 'bg-violet-50 text-violet-700'
  },
  {
    key: 'verification',
    title: 'Awaiting verification',
    blurb: 'Candidate agreed — ownership still to be proven.',
    statuses: ['VERIFICATION_PENDING'],
    icon: Boxes,
    tone: 'border-amber-200',
    chip: 'bg-amber-50 text-amber-700'
  },
  {
    key: 'ready',
    title: 'Ready for pickup',
    blurb: 'Verified. Staff can authorise the handover.',
    statuses: ['VERIFIED', 'RETURN_READY'],
    icon: PackageCheck,
    tone: 'border-emerald-200',
    chip: 'bg-emerald-50 text-emerald-700'
  },
  {
    key: 'closed',
    title: 'Recovered & closed',
    blurb: 'Handed back to the owner or archived.',
    statuses: ['RETURNED', 'CLOSED'],
    icon: PackageCheck,
    tone: 'border-sky-200',
    chip: 'bg-sky-50 text-sky-700'
  }
];

const flowFor = (type) => (type === 'LOST' ? LOST_FLOW : FOUND_FLOW);

function nextStatusesFor(report) {
  const flow = flowFor(report.type);
  const idx = flow.indexOf(report.status);
  if (idx === -1) return [];
  return STAFF_STATUS_CHANGES.filter((s) => flow.indexOf(s) > idx);
}

/**
 * OrgItems — the custody board.
 * Endpoint: GET /api/reports?scope=all, grouped client-side by status lane.
 * Status changes go through PATCH /api/reports/:id the server validates.
 */
export default function OrgItems() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { activeOrganizationId, permissions } = useOrganization();

  const canUpdateStatus = permissions.includes('report:update-status');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [holderFilter, setHolderFilter] = useState('ALL');
  const [ledgerOnly, setLedgerOnly] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isError, error, refetch } = useReports(activeOrganizationId, {
    scope: 'all',
    limit: 200
  });

  const custodyQuery = useCustody(activeOrganizationId, {});
  const custodyRecords = custodyQuery.data?.records || [];

  // Group custody records by reportId to derive the latest holder and event count
  const custodySummaryByReport = useMemo(() => {
    const map = new Map();
    custodyRecords.forEach((record) => {
      const key = String(record.report?.id ?? record.reportId ?? '');
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(record);
    });
    const summary = new Map();
    map.forEach((records, reportId) => {
      records.sort((a, b) => new Date(a.occurredAt || a.createdAt) - new Date(b.occurredAt || b.createdAt));
      const latest = records[records.length - 1];
      summary.set(reportId, {
        totalRecords: records.length,
        currentHolder: latest.currentHolder || latest.toCustodian || latest.fromCustodian || null,
        latestEvent: latest.event,
        latestLocation: latest.location,
        lastUpdated: latest.occurredAt || latest.createdAt
      });
    });
    return summary;
  }, [custodyRecords]);

  // Unique holders for filter dropdown
  const availableHolders = useMemo(() => {
    const set = new Set();
    custodySummaryByReport.forEach((info) => {
      if (info.currentHolder) set.add(info.currentHolder);
    });
    return Array.from(set).sort();
  }, [custodySummaryByReport]);

  const allReports = data?.reports || [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allReports.filter((report) => {
      const reportKey = String(report.id);
      const custody = custodySummaryByReport.get(reportKey);

      if (ledgerOnly && !custody) return false;
      if (holderFilter !== 'ALL' && custody?.currentHolder !== holderFilter) return false;

      if (!term) return true;
      return [
        report.itemProfile?.itemName,
        report.category,
        report.location,
        report.reference,
        report.description,
        report.itemProfile?.brand,
        custody?.currentHolder,
        custody?.latestLocation
      ].filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [allReports, search, holderFilter, ledgerOnly, custodySummaryByReport]);

  const lanes = useMemo(() => LANES
    .map((lane) => ({ ...lane, items: filtered.filter((r) => lane.statuses.includes(r.status)) }))
    .filter((lane) => lane.items.length > 0), [filtered]);

  const inCustody = filtered.filter((r) => !['RETURNED', 'CLOSED'].includes(r.status)).length;
  const awaitingVerification = filtered.filter((r) => r.status === 'VERIFICATION_PENDING').length;
  const readyForPickup = filtered.filter((r) => ['VERIFIED', 'RETURN_READY'].includes(r.status)).length;

  const changeStatus = async (report, nextStatus) => {
    setBusyId(report.id);
    try {
      await api.updateReport(report.id, { status: nextStatus, statusNote: `Moved to ${nextStatus} from items in custody` });
      toast.success(`${itemName(report)} moved to ${statusLabel(nextStatus)}`);
      qc.invalidateQueries({ queryKey: ['reports', activeOrganizationId] });
      qc.invalidateQueries({ queryKey: ['org-analytics', activeOrganizationId] });
    } catch (err) {
      toast.error(err?.message || 'Could not update the report status');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Items in custody"
        subtitle="Every report the organization is holding, grouped by the stage it has reached in the recovery flow."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="In custody"
          value={inCustody}
          icon={<Boxes className="h-5 w-5" />}
          color="sky"
          loading={isLoading}
          description="Not yet returned or closed"
        />
        <StatCard
          label="Awaiting verification"
          value={awaitingVerification}
          icon={<Loader2 className="h-5 w-5" />}
          color="amber"
          loading={isLoading}
          description="Ownership challenge open"
        />
        <StatCard
          label="Ready for pickup"
          value={readyForPickup}
          icon={<PackageCheck className="h-5 w-5" />}
          color="emerald"
          loading={isLoading}
          description="Verified, awaiting handover"
        />
      </div>

      <div className="card-surface mb-5 p-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search the custody board by item, brand, holder, location or reference…"
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

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
          <span className="font-semibold text-slate-500">Filters:</span>
          {availableHolders.length > 0 && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="holder-filter" className="text-slate-500">Current holder:</label>
              <select
                id="holder-filter"
                value={holderFilter}
                onChange={(e) => setHolderFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 focus:border-brand-300 focus:outline-none"
              >
                <option value="ALL">All holders ({availableHolders.length})</option>
                {availableHolders.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          )}

          <label className="flex items-center gap-1.5 cursor-pointer select-none text-slate-600 ml-auto">
            <input
              type="checkbox"
              checked={ledgerOnly}
              onChange={(e) => setLedgerOnly(e.target.checked)}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-3.5 w-3.5"
            />
            <span className="font-medium text-xs">On custody ledger only</span>
          </label>
        </div>
      </div>

      {isError && <ErrorState error={error} onRetry={() => refetch()} />}

      {isLoading ? (
        <SkeletonList count={5} />
      ) : (
        !isError && (
          lanes.length === 0 ? (
            <div className="card-surface">
              {search
                ? <EmptyStates.NoSearch term={search} />
                : <EmptyStates.NoReports actionLabel="Report a lost item" onAction={() => navigate('/report?type=lost')} />}
            </div>
          ) : (
            <div className="space-y-6">
              {lanes.map((lane, laneIndex) => {
                const Icon = lane.icon;
                return (
                  <motion.section
                    key={lane.key}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(laneIndex * 0.05, 0.2) }}
                    className={cn('rounded-2xl border bg-white shadow-soft', lane.tone)}
                  >
                    <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
                      <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', lane.chip)}>
                        <Icon className={cn('h-[18px] w-[18px]', lane.key === 'matching' && 'animate-spin')} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-bold text-slate-900">{lane.title}</h2>
                        <p className="text-xs text-slate-500">{lane.blurb}</p>
                      </div>
                      <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold', lane.chip)}>
                        {lane.items.length}
                      </span>
                    </header>

                    <ul className="divide-y divide-slate-50">
                      {lane.items.map((report) => {
                        const options = nextStatusesFor(report);
                        const custody = custodySummaryByReport.get(String(report.id));
                        return (
                          <li key={report.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
                            <button
                              onClick={() => navigate(`/organization/recovery?tab=reports&reportId=${report.id}`)}
                              className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            >
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-lg">
                                <ItemThumb report={report} className="h-full w-full" rounded="" />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-slate-800">{itemName(report)}</span>
                                <span className="flex items-center gap-1 truncate text-xs text-slate-500">
                                  <MapPin className="h-3 w-3 shrink-0" /> {report.location}
                                </span>
                                {custody && (
                                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                    {custody.currentHolder && (
                                      <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                                        <User className="h-3 w-3 text-slate-400" /> Holder: {custody.currentHolder}
                                      </span>
                                    )}
                                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                                      <Shield className="h-2.5 w-2.5 text-brand-600" /> {custody.totalRecords} ledger record{custody.totalRecords === 1 ? '' : 's'}
                                    </span>
                                  </span>
                                )}
                              </span>
                            </button>

                            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                              {custody ? (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/organization/operations?tab=custody&reportId=${report.id}`)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
                                  title="Inspect full chain of custody log"
                                >
                                  <History className="h-3 w-3 text-brand-600" />
                                  <span>Custody trail</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/organization/operations?tab=custody&reportId=${report.id}`)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-400 hover:text-slate-600"
                                  title="No custody log yet - click to open chain"
                                >
                                  <span>+ Open ledger</span>
                                </button>
                              )}

                              <StatusBadge status={report.status} />
                              <span className="text-[11px] text-slate-400">{relativeTime(report.updatedAt || report.createdAt)}</span>
                              {options.length > 0 ? (
                                <select
                                  value=""
                                  disabled={!canUpdateStatus || busyId === report.id}
                                  title={canUpdateStatus ? 'Move this item to the next stage' : 'Only organization staff can change a report status'}
                                  onChange={(e) => { if (e.target.value) changeStatus(report, e.target.value); }}
                                  className={cn(
                                    'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700',
                                    canUpdateStatus ? 'hover:border-brand-300 focus:border-brand-300 focus:outline-none' : 'cursor-not-allowed opacity-50'
                                  )}
                                >
                                  <option value="">{busyId === report.id ? 'Updating…' : 'Move to…'}</option>
                                  {options.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                                </select>
                              ) : (
                                <span className="text-[11px] font-semibold text-slate-400">Final stage</span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </motion.section>
                );
              })}
            </div>
          )
        )
      )}

      {!canUpdateStatus && allReports.length > 0 && (
        <p className="mt-4 text-xs text-slate-400">
          You can browse the custody board, but moving an item requires the report:update-status permission.
        </p>
      )}

      {data && data.total > allReports.length && (
        <p className="mt-4 text-xs text-slate-400">
          Showing the {allReports.length} most recent of {data.total} reports. Narrow the search to reach older items.
        </p>
      )}
    </div>
  );
}
