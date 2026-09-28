import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ClipboardList,
  Loader2,
  MapPin,
  PackageMinus,
  PackagePlus,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { useReports } from '../../lib/queries';
import api from '../../lib/api';
import { useToast, ConfirmDialog } from '../../components/Toast';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import ErrorState from '../../components/ErrorState';
import { EmptyStates } from '../../components/EmptyState';
import { Button } from '../../components/ui/Button';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { formatDate, itemName, relativeTime, statusLabel } from '../../lib/format';
import { ItemThumb } from '../../components/ItemThumb';
import { cn } from '../../lib/cn';

/* The status machine the server validates against. Offering a transition the
   API would reject just produces an error toast, so the UI mirrors the rules. */
const LOST_FLOW = ['REPORTED', 'MATCHING', 'POTENTIAL_MATCH', 'VERIFICATION_PENDING', 'VERIFIED', 'RETURN_READY', 'RETURNED', 'CLOSED'];
const FOUND_FLOW = ['FOUND', 'MATCHING', 'MATCHED', 'VERIFIED', 'RETURNED', 'CLOSED'];
const STAFF_STATUS_CHANGES = ['MATCHING', 'POTENTIAL_MATCH', 'VERIFICATION_PENDING', 'VERIFIED', 'RETURN_READY', 'RETURNED', 'CLOSED'];

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'REPORTED', label: 'Reported' },
  { value: 'FOUND', label: 'Found' },
  { value: 'MATCHING', label: 'Matching' },
  { value: 'MATCHED', label: 'Matched' },
  { value: 'POTENTIAL_MATCH', label: 'Potential match' },
  { value: 'VERIFICATION_PENDING', label: 'Verification pending' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'RETURN_READY', label: 'Return ready' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'CLOSED', label: 'Closed' }
];

const PAGE_SIZE = 20;

const flowFor = (type) => (type === 'LOST' ? LOST_FLOW : FOUND_FLOW);

/** Only forward transitions the server will actually accept. */
function nextStatusesFor(report) {
  const flow = flowFor(report.type);
  const idx = flow.indexOf(report.status);
  if (idx === -1) return [];
  return STAFF_STATUS_CHANGES.filter((s) => flow.indexOf(s) > idx);
}

function TypeChip({ type }) {
  const isLost = type === 'LOST';
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
      isLost ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-sky-200 bg-sky-50 text-sky-700'
    )}
    >
      {isLost ? <PackageMinus className="h-3 w-3" /> : <PackagePlus className="h-3 w-3" />}
      {isLost ? 'Lost' : 'Found'}
    </span>
  );
}

/**
 * OrgLostFound — every report in the active organization.
 * Endpoint: GET /api/reports?scope=all (type/status/search/limit/offset).
 */
export default function OrgLostFound() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { activeOrganizationId, permissions, isManager } = useOrganization();

  const canUpdateStatus = permissions.includes('report:update-status');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // Deep link support: other pages (AI match detail, custody) send staff here
  // with ?reportId= to land on one specific report rather than page 1 of the list.
  const [focusId, setFocusId] = useState(() => searchParams.get('reportId') || '');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setOffset(0); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => { setOffset(0); }, [type, status]);

  // Keep the focus in sync when navigation rewrites the query string.
  useEffect(() => {
    const fromQuery = searchParams.get('reportId');
    if (fromQuery && fromQuery !== focusId) { setFocusId(fromQuery); setOffset(0); }
  }, [searchParams, focusId]);

  const params = useMemo(() => ({
    type: type || undefined,
    status: status || undefined,
    search: search || undefined,
    scope: 'all',
    limit: PAGE_SIZE,
    offset
  }), [type, status, search, offset]);

  const { data, isLoading, isFetching, isError, error, refetch } = useReports(activeOrganizationId, params);

  const allReports = data?.reports || [];
  // A deep-linked report may sit on a later page, so it is hoisted to the top of
  // the list and highlighted rather than silently filtered away.
  const focused = focusId ? allReports.find((r) => String(r.id) === String(focusId)) : null;
  const reports = focused ? [focused, ...allReports.filter((r) => String(r.id) !== String(focusId))] : allReports;
  const total = data?.total || 0;
  const hasFilters = Boolean(type || status || search);

  const invalidateOrg = () => {
    qc.invalidateQueries({ queryKey: ['reports', activeOrganizationId] });
    qc.invalidateQueries({ queryKey: ['org-analytics', activeOrganizationId] });
    qc.invalidateQueries({ queryKey: ['dashboard', activeOrganizationId] });
  };

  const changeStatus = async (report, nextStatus) => {
    setBusyId(report.id);
    try {
      await api.updateReport(report.id, { status: nextStatus, statusNote: `Status changed to ${nextStatus} by organization staff` });
      toast.success(`${itemName(report)} moved to ${statusLabel(nextStatus)}`);
      invalidateOrg();
    } catch (err) {
      toast.error(err?.message || 'Could not update the report status');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteReport(pendingDelete.id);
      toast.success(`Report ${pendingDelete.reference || pendingDelete.id} deleted`);
      setPendingDelete(null);
      invalidateOrg();
    } catch (err) {
      toast.error(err?.message || 'Could not delete the report');
    } finally {
      setDeleting(false);
    }
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Lost & Found"
        subtitle={`Every lost and found report filed in this organization · ${total} total`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Reports in view"
          value={total}
          icon={<ClipboardList className="h-5 w-5" />}
          color="sky"
          loading={isLoading}
          description={hasFilters ? 'Matching your filters' : 'Across the organization'}
        />
        <StatCard
          label="Lost reports"
          value={reports.filter((r) => r.type === 'LOST').length}
          icon={<PackageMinus className="h-5 w-5" />}
          color="amber"
          loading={isLoading}
          description="On this page"
        />
        <StatCard
          label="Found reports"
          value={reports.filter((r) => r.type === 'FOUND').length}
          icon={<PackagePlus className="h-5 w-5" />}
          color="emerald"
          loading={isLoading}
          description="On this page"
        />
      </div>

      <div className="card-surface mb-5 flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search item name, brand, colour, location or reference…"
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

        <div className="flex flex-wrap gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 focus:border-brand-300 focus:outline-none"
          >
            <option value="">Lost &amp; found</option>
            <option value="LOST">Lost only</option>
            <option value="FOUND">Found only</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 focus:border-brand-300 focus:outline-none"
          >
            {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {focusId && !isLoading && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3">
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-brand-900">
            {focused
              ? 'Showing the report you were linked to, pinned to the top of this list.'
              : `No report in this organization matches the link you followed (${focusId}). It may have been removed, or it belongs to another organization.`}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setFocusId(''); setOffset(0); navigate('/organization/recovery?tab=reports', { replace: true }); }}
          >
            Show all reports
          </Button>
        </div>
      )}

      {isError && <ErrorState error={error} onRetry={() => refetch()} />}
      {isError && <ErrorState error={error} onRetry={() => refetch()} />}

      {isLoading ? (
        <SkeletonTable rows={8} cols={5} />
      ) : (
        !isError && (
          <>
            {reports.length === 0 ? (
              hasFilters ? (
                <div className="card-surface">
                  <EmptyStates.NoSearch term={search || type || status} />
                </div>
              ) : (
                <div className="card-surface">
                  <EmptyStates.NoReports actionLabel="Report a lost item" onAction={() => navigate('/report?type=lost')} />
                </div>
              )
            ) : (
              <>
                <div className="card-surface hidden overflow-hidden lg:block">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                    <p className="text-sm font-bold text-slate-900">All organization reports</p>
                    {isFetching && <Loader2 className="h-4 w-4 animate-spin text-brand-500" />}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left">
                      <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                          <th className="px-5 py-3">Item</th>
                          <th className="px-3 py-3">Type</th>
                          <th className="px-3 py-3">Location</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3">Reported</th>
                          <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {reports.map((report) => {
                          const options = nextStatusesFor(report);
                          const isFocused = focusId && String(report.id) === String(focusId);
                          return (
                            <tr
                              key={report.id}
                              onClick={() => navigate(`/my-reports/${report.id}`)}
                              // A clickable <tr> is not reachable by keyboard, so the
                              // row also carries tab focus and responds to Enter /
                              // Space. A real <a> would break the table layout.
                              tabIndex={0}
                              role="link"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  navigate(`/my-reports/${report.id}`);
                                }
                              }}
                              aria-label={`Open report ${report.reference}, ${itemName(report)}`}
                              className={cn(
                                'cursor-pointer transition hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400',
                                isFocused && 'bg-brand-50/70 ring-1 ring-inset ring-brand-200'
                              )}
                            >
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <ItemThumb report={report} className="h-10 w-10 shrink-0" iconClass="h-4 w-4" />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-800">{itemName(report)}</p>
                                    <p className="truncate text-xs text-slate-500">
                                      {report.reference} · {report.category}
                                      {report.matches?.length ? ` · ${report.matches.length} match${report.matches.length === 1 ? '' : 'es'}` : ''}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3.5"><TypeChip type={report.type} /></td>
                              <td className="max-w-[180px] truncate px-3 py-3.5 text-sm text-slate-600">{report.location}</td>
                              <td className="px-3 py-3.5"><StatusBadge status={report.status} /></td>
                              <td className="whitespace-nowrap px-3 py-3.5 text-xs text-slate-500" title={formatDate(report.createdAt)}>
                                {relativeTime(report.createdAt)}
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                  <StatusSelect
                                    report={report}
                                    options={options}
                                    enabled={canUpdateStatus}
                                    busy={busyId === report.id}
                                    onChange={(next) => changeStatus(report, next)}
                                  />
                                  {isManager && (
                                    <button
                                      onClick={() => setPendingDelete(report)}
                                      className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                      aria-label="Delete report"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3 lg:hidden">
                  {reports.map((report, i) => (
                    <motion.div
                      key={report.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.2) }}
                      className={cn(
                        'card-surface p-4',
                        focusId && String(report.id) === String(focusId) && 'ring-2 ring-brand-300'
                      )}
                    >
                      <button onClick={() => navigate(`/my-reports/${report.id}`)} className="w-full text-left">
                        <div className="flex items-start gap-3">
                          <ItemThumb report={report} className="h-10 w-10 shrink-0" iconClass="h-4 w-4" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-900">{itemName(report)}</p>
                            <p className="truncate text-xs text-slate-500">{report.reference} · {report.category}</p>
                            <p className="mt-1.5 flex items-center gap-1 truncate text-xs text-slate-500">
                              <MapPin className="h-3.5 w-3.5 shrink-0" /> {report.location}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <TypeChip type={report.type} />
                          <StatusBadge status={report.status} />
                          <span className="text-[11px] text-slate-400">{relativeTime(report.createdAt)}</span>
                        </div>
                      </button>
                      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                        <StatusSelect
                          report={report}
                          options={nextStatusesFor(report)}
                          enabled={canUpdateStatus}
                          busy={busyId === report.id}
                          onChange={(next) => changeStatus(report, next)}
                          className="flex-1"
                        />
                        {isManager && (
                          <Button variant="danger" size="sm" onClick={() => setPendingDelete(report)}>
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {total > PAGE_SIZE && (
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">Page {page} of {pages} · {total} reports</p>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                        Previous
                      </Button>
                      <Button variant="secondary" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {!canUpdateStatus && reports.length > 0 && (
              <p className="mt-4 text-xs text-slate-400">
                Status changes are limited to organization staff. You have the {permissions.includes('report:view-all') ? 'view-all' : 'member'} permission set.
              </p>
            )}
          </>
        )
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete this report?"
        description={pendingDelete ? `${itemName(pendingDelete)} (${pendingDelete.reference}) will be permanently removed from the organization, along with its match history.` : ''}
        confirmLabel="Delete report"
      />
    </div>
  );
}

function StatusSelect({ report, options, enabled, busy, onChange, className }) {
  if (!options.length) {
    return (
      <span className={cn('text-[11px] font-semibold text-slate-400', className)}>
        {report.status === 'CLOSED' ? 'No further transitions' : 'Final stage'}
      </span>
    );
  }

  return (
    <select
      value=""
      disabled={!enabled || busy}
      title={enabled ? 'Move this report to the next stage' : 'Only organization staff can change a report status'}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
      className={cn(
        'rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition',
        enabled ? 'hover:border-brand-300 focus:border-brand-300 focus:outline-none' : 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <option value="">{busy ? 'Updating…' : 'Move to…'}</option>
      {options.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
    </select>
  );
}
