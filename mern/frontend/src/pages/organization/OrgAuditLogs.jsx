import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Download, FileJson, Filter, ScrollText, X } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { useAuditLogs } from '../../lib/queries';
import api from '../../lib/api';
import { useToast } from '../../components/Toast';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';
import { Button } from '../../components/ui/Button';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { formatDateTime, initialsOf, relativeTime } from '../../lib/format';
import { cn } from '../../lib/cn';

const PAGE_SIZE = 50;

const ENTITY_TONES = {
  REPORT: 'border-sky-200 bg-sky-50 text-sky-700',
  MATCH: 'border-violet-200 bg-violet-50 text-violet-700',
  VERIFICATION: 'border-amber-200 bg-amber-50 text-amber-700',
  RETURN: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  USER: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  ORGANIZATION: 'border-brand-200 bg-brand-50 text-brand-700'
};

const ACTION_TONES = [
  { match: /DELETE|REJECT|FAILED|REVOKE/, className: 'border-rose-200 bg-rose-50 text-rose-700' },
  { match: /CREATE|ADDED|INVITE|APPROVED|PASSED|AUTHORIZED|SCANNED/, className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { match: /UPDATE|SETTINGS|ROLE|SWITCH|QR_REFRESHED/, className: 'border-amber-200 bg-amber-50 text-amber-700' }
];

function actionTone(action = '') {
  const hit = ACTION_TONES.find((t) => t.match.test(action));
  return hit ? hit.className : 'border-slate-200 bg-slate-100 text-slate-600';
}

/** Flattens the metadata object into readable key/value chips. */
function MetadataChips({ metadata }) {
  if (!metadata || typeof metadata !== 'object') return <span className="text-xs text-slate-400">—</span>;
  const entries = Object.entries(metadata);
  if (!entries.length) return <span className="text-xs text-slate-400">No metadata</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {entries.slice(0, 5).map(([key, value]) => (
        <span key={key} className="inline-flex max-w-[260px] items-center gap-1 rounded-md bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
          <span className="font-bold text-slate-500">{key}:</span>
          <span className="truncate">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
        </span>
      ))}
      {entries.length > 5 && <span className="text-[11px] text-slate-400">+{entries.length - 5} more</span>}
    </span>
  );
}

function toCsv(logs) {
  const headers = ['id', 'createdAt', 'action', 'entityType', 'entityId', 'userId', 'ip', 'metadata'];
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = logs.map((log) => [
    log.id,
    log.createdAt,
    log.action,
    log.entityType,
    log.entityId,
    log.userId,
    log.ip,
    JSON.stringify(log.metadata || {})
  ].map(escape).join(','));
  return [headers.join(','), ...rows].join('\n');
}

/**
 * OrgAuditLogs — every sensitive action recorded for the organization.
 * Endpoints: GET /api/audit-logs (action/entityType/startDate/endDate/limit/offset)
 * and GET /api/audit-log-types for the complete action vocabulary.
 * CSV export builds the file from the rows currently loaded — it is labelled
 * that way so nobody mistakes it for a full-history dump.
 */
export default function OrgAuditLogs() {
  const { activeOrganizationId, activeOrganization } = useOrganization();
  const toast = useToast();

  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState(null);

  const { data: actionTypes } = useQuery({
    queryKey: ['audit-log-types', activeOrganizationId],
    queryFn: () => api.listActionTypes(),
    enabled: Boolean(activeOrganizationId),
    staleTime: 300_000
  });

  const params = useMemo(() => ({
    action: action || undefined,
    entityType: entityType || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit: PAGE_SIZE,
    offset
  }), [action, entityType, startDate, endDate, offset]);

  const { data, isLoading, isError, error, refetch } = useAuditLogs(activeOrganizationId, params);

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const actions = actionTypes?.actions || [];
  const entityTypes = useMemo(
    () => Array.from(new Set(logs.map((l) => l.entityType).filter(Boolean))).sort(),
    [logs]
  );
  const hasFilters = Boolean(action || entityType || startDate || endDate);

  const resetFilters = () => {
    setAction('');
    setEntityType('');
    setStartDate('');
    setEndDate('');
    setOffset(0);
  };

  const exportCsv = () => {
    if (!logs.length) return;
    const csv = toCsv(logs);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const org = (activeOrganization?.name || 'organization').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    link.href = url;
    link.download = `lostlink-audit-${org}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${logs.length} audit rows to CSV`);
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle={`Every sensitive action recorded for ${activeOrganization?.name || 'this organization'}, with the actor, the target and the payload.`}
        actions={(
          <Button variant="secondary" onClick={exportCsv} disabled={!logs.length} title={logs.length ? undefined : 'Nothing loaded to export'}>
            <Download className="h-4 w-4" /> Export {logs.length ? `${logs.length} rows` : 'CSV'}
          </Button>
        )}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Matching filters"
          value={total}
          icon={<ScrollText className="h-5 w-5" />}
          color="sky"
          loading={isLoading}
          description="Audit records in this result set"
        />
        <StatCard
          label="Loaded on this page"
          value={logs.length}
          icon={<FileJson className="h-4 w-5" />}
          color="violet"
          loading={isLoading}
          description="Rows the CSV export will contain"
        />
        <StatCard
          label="Distinct actors"
          value={new Set(logs.map((l) => l.userId).filter(Boolean)).size}
          icon={<Filter className="h-5 w-5" />}
          color="emerald"
          loading={isLoading}
          description="People who acted on this page"
        />
      </div>

      <div className="card-surface mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Action</span>
            <select
              value={action}
              onChange={(e) => { setAction(e.target.value); setOffset(0); }}
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 focus:border-brand-300 focus:outline-none"
            >
              <option value="">All actions</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Entity type</span>
            <select
              value={entityType}
              onChange={(e) => { setEntityType(e.target.value); setOffset(0); }}
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 focus:border-brand-300 focus:outline-none"
            >
              <option value="">All entities</option>
              {entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setOffset(0); }}
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-brand-300 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setOffset(0); }}
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-brand-300 focus:outline-none"
            />
          </label>
        </div>

        {hasFilters && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-slate-500">Filtering by:</span>
            {action && <FilterChip label="action" value={action} onClear={() => { setAction(''); setOffset(0); }} />}
            {entityType && <FilterChip label="entity" value={entityType} onClear={() => { setEntityType(''); setOffset(0); }} />}
            {startDate && <FilterChip label="from" value={startDate} onClear={() => { setStartDate(''); setOffset(0); }} />}
            {endDate && <FilterChip label="to" value={endDate} onClear={() => { setEndDate(''); setOffset(0); }} />}
            <button onClick={resetFilters} className="text-xs font-bold text-brand-700 hover:underline">Clear all</button>
          </div>
        )}
      </div>

      {isError && <ErrorState error={error} onRetry={() => refetch()} />}

      {isLoading ? (
        <SkeletonTable rows={8} cols={5} />
      ) : (
        !isError && (
          logs.length === 0 ? (
            <div className="card-surface">
              <EmptyState
                illustration="📝"
                title={hasFilters ? 'No audit entries match these filters' : 'No audit entries yet'}
                description={hasFilters
                  ? 'Widen the date range, pick a different action, or clear the filters to see everything recorded.'
                  : 'Every sensitive action in this organization is written here as it happens — report edits, reviews, handovers, role changes and settings changes.'}
                actionLabel={hasFilters ? 'Clear filters' : undefined}
                onAction={hasFilters ? resetFilters : undefined}
              />
            </div>
          ) : (
            <>
              <div className="card-surface hidden overflow-hidden lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                        <th className="px-5 py-3">When</th>
                        <th className="px-3 py-3">Actor</th>
                        <th className="px-3 py-3">Action</th>
                        <th className="px-3 py-3">Entity</th>
                        <th className="px-5 py-3">Metadata</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {logs.map((log) => (
                        <tr key={log.id} className="transition hover:bg-brand-50/30">
                          <td className="whitespace-nowrap px-5 py-3">
                            <p className="text-sm font-semibold text-slate-700">{relativeTime(log.createdAt)}</p>
                            <p className="text-[11px] text-slate-400">{formatDateTime(log.createdAt)}</p>
                          </td>
                          <td className="px-3 py-3">
                            <span className="flex items-center gap-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-extrabold text-slate-500">
                                {initialsOf(log.userId || 'System')}
                              </span>
                              <span className="truncate font-mono text-[11px] text-slate-500">{log.userId || 'system'}</span>
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold', actionTone(log.action))}>
                              {log.action}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={cn(
                              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
                              ENTITY_TONES[log.entityType] || 'border-slate-200 bg-slate-100 text-slate-600'
                            )}
                            >
                              {log.entityType || 'UNKNOWN'}
                            </span>
                            {log.entityId && <p className="mt-1 truncate font-mono text-[11px] text-slate-400">{log.entityId}</p>}
                          </td>
                          <td className="px-5 py-3">
                            <MetadataChips metadata={log.metadata} />
                            <p className="mt-1 text-[10px] text-slate-300">ip {log.ip || 'unknown'}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <ul className="space-y-3 lg:hidden">
                {logs.map((log, i) => (
                  <motion.li
                    key={log.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: Math.min(i * 0.015, 0.2) }}
                    className="card-surface p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold', actionTone(log.action))}>
                        {log.action}
                      </span>
                      <span className="text-[11px] text-slate-400">{relativeTime(log.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      <span className={cn('mr-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold', ENTITY_TONES[log.entityType] || 'border-slate-200 bg-slate-100 text-slate-600')}>
                        {log.entityType || 'UNKNOWN'}
                      </span>
                      {log.entityId}
                    </p>
                    <div className="mt-2">
                      <MetadataChips metadata={log.metadata} />
                    </div>
                    <button
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                      className="mt-2 text-[11px] font-bold text-brand-700"
                    >
                      {expanded === log.id ? 'Hide details' : 'Show details'}
                    </button>
                    {expanded === log.id && (
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-200 scrollbar-thin">
{JSON.stringify({ id: log.id, userId: log.userId, ip: log.ip, createdAt: log.createdAt, metadata: log.metadata }, null, 2)}
                      </pre>
                    )}
                  </motion.li>
                ))}
              </ul>

              {total > PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">Page {page} of {pages} · {total} entries</p>
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
          )
        )
      )}
    </div>
  );
}

function FilterChip({ label, value, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
      <span className="text-slate-400">{label}:</span>
      <span className="max-w-[180px] truncate">{value}</span>
      <button onClick={onClear} className="text-slate-400 hover:text-slate-700" aria-label={`Clear ${label} filter`}>
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
