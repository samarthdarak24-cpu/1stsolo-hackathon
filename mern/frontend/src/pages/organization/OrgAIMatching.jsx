import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Flag,
  Sparkles,
  Target,
  Timer
} from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { useMatches } from '../../lib/queries';
import api from '../../lib/api';
import { useToast, Modal, ConfirmDialog } from '../../components/Toast';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';
import { Button } from '../../components/ui/Button';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Progress } from '../../components/ui/Progress';
import { formatDate, itemName, scoreLabel, scoreTone, statusLabel } from '../../lib/format';
import { ItemThumb } from '../../components/ItemThumb';
import { cn } from '../../lib/cn';

const STATUS_FILTERS = [
  { value: '', label: 'All matches' },
  { value: 'PENDING_VERIFICATION', label: 'Pending verification' },
  { value: 'MANUAL_REVIEW', label: 'Needs manual review' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' }
];

const SCORE_FILTERS = [
  { value: 0, label: 'Any score' },
  { value: 35, label: '35% and above' },
  { value: 55, label: '55% and above' },
  { value: 75, label: '75% and above' },
  { value: 90, label: '90% and above' }
];

const ACTIONS = [
  {
    key: 'approve',
    label: 'Approve',
    icon: CheckCircle2,
    tone: 'text-emerald-700',
    active: 'border-emerald-500 bg-emerald-50',
    blurb: 'Confirms the found item is the reported lost item and moves it to the verification step.'
  },
  {
    key: 'reject',
    label: 'Reject',
    icon: Ban,
    tone: 'text-rose-700',
    active: 'border-rose-500 bg-rose-50',
    blurb: 'Marks the candidate as a false positive. Both counterparties are notified.'
  },
  {
    key: 'escalate',
    label: 'Escalate',
    icon: Flag,
    tone: 'text-amber-700',
    active: 'border-amber-500 bg-amber-50',
    blurb: 'Flags the candidate for a human reviewer to look at later.'
  }
];

/** Top three weighted signals — the honest "why" behind a candidate score. */
function EvidenceSummary({ match }) {
  const evidence = Array.isArray(match?.evidence) ? match.evidence : [];
  const weighted = evidence.filter((e) => Number(e.weight) > 0);
  const top = (weighted.length ? weighted : evidence)
    .slice()
    .sort((a, b) => (b.score * (b.weight || 0)) - (a.score * (a.weight || 0)))
    .slice(0, 3);

  if (!top.length) {
    return <p className="text-xs text-slate-400">No signal breakdown was stored for this match.</p>;
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {top.map((e) => {
        const tone = scoreTone(e.score);
        return (
          <li
            key={e.key}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
              tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : tone === 'warning'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
            )}
            title={e.detail || `${e.label}: ${e.score}% (${e.strength})`}
          >
            {e.label} {e.score}%
          </li>
        );
      })}
    </ul>
  );
}

function Side({ report, caption }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-base">
        <ItemThumb report={report} className="h-full w-full" rounded="" />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{caption}</span>
        <span className="block truncate text-sm font-semibold text-slate-800">{itemName(report || {})}</span>
        <span className="block truncate text-[11px] text-slate-500">{report?.location}</span>
      </span>
    </div>
  );
}

/**
 * OrgAIMatching — organization-wide review queue for AI candidate matches.
 * Endpoint: GET /api/matches (status/minScore) and POST /api/matches/:id/review.
 */
export default function OrgAIMatching() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { activeOrganizationId, permissions } = useOrganization();

  const canReview = permissions.includes('match:review');

  const [status, setStatus] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [reviewing, setReviewing] = useState(null);
  const [action, setAction] = useState('approve');
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const params = useMemo(() => ({
    status: status || undefined,
    minScore: minScore || undefined,
    limit: 50
  }), [status, minScore]);

  const { data, isLoading, isError, error, refetch } = useMatches(activeOrganizationId, params);
  const matches = data?.matches || [];
  const total = data?.total ?? matches.length;

  const openReview = (match) => {
    setReviewing(match);
    setAction('approve');
    setNotes('');
  };

  const closeReview = () => {
    setReviewing(null);
    setNotes('');
    setAction('approve');
  };

  const submitReview = async () => {
    if (!reviewing) return;
    setSaving(true);
    try {
      const res = await api.reviewMatch(reviewing.id, { action, notes: notes.trim() || undefined });
      toast.success(res?.message || 'Match reviewed');
      setConfirming(false);
      closeReview();
      qc.invalidateQueries({ queryKey: ['matches', activeOrganizationId] });
      qc.invalidateQueries({ queryKey: ['match', activeOrganizationId] });
      qc.invalidateQueries({ queryKey: ['org-analytics', activeOrganizationId] });
    } catch (err) {
      toast.error(err?.message || 'Could not record the review');
    } finally {
      setSaving(false);
    }
  };

  const pending = matches.filter((m) => ['PENDING_VERIFICATION', 'MANUAL_REVIEW', 'PENDING'].includes(m.status));
  const highConfidence = matches.filter((m) => (m.finalScore || 0) >= 85);
  const decided = matches.filter((m) => ['APPROVED', 'REJECTED', 'VERIFIED'].includes(m.status));

  return (
    <div>
      <PageHeader
        title="AI Matching"
        subtitle="Every candidate match LostLink AI produced in this organization, and the queue staff work through."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="In this view"
          value={total}
          icon={<Sparkles className="h-5 w-5" />}
          color="violet"
          loading={isLoading}
          description="Matches matching your filters"
        />
        <StatCard
          label="Awaiting a decision"
          value={pending.length}
          icon={<Timer className="h-5 w-5" />}
          color="amber"
          loading={isLoading}
          description="Pending verification or manual review"
        />
        <StatCard
          label="High confidence"
          value={highConfidence.length}
          icon={<Target className="h-5 w-5" />}
          color="emerald"
          loading={isLoading}
          description={`Scored 85% or above · ${decided.length} already decided`}
        />
      </div>

      <div className="card-surface mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 focus:border-brand-300 focus:outline-none"
          >
            {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 focus:border-brand-300 focus:outline-none"
          >
            {SCORE_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <p className="text-xs text-slate-500">
          A match is a candidate recommendation, never proof of ownership.
        </p>
      </div>

      {isError && <ErrorState error={error} onRetry={() => refetch()} />}

      {isLoading ? (
        <SkeletonList count={4} />
      ) : (
        !isError && (
          matches.length === 0 ? (
            <div className="card-surface">
              <EmptyState
                illustration="🤖"
                title="No matches match these filters"
                description={
                  status || minScore
                    ? 'Try widening the status or score filter, or clear them to see every candidate in this organization.'
                    : 'LostLink AI creates a candidate whenever a new lost report lines up with a find. Nothing has been paired yet.'
                }
                actionLabel={status || minScore ? 'Clear filters' : undefined}
                onAction={status || minScore ? () => { setStatus(''); setMinScore(0); } : undefined}
              />
            </div>
          ) : (
            <ul className="space-y-4">
              {matches.map((match, i) => (
                <motion.li
                  key={match.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.25) }}
                  className="card-surface p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                      <Side report={match.lost} caption="Lost" />
                      <span className="hidden text-lg text-slate-300 sm:block">↔</span>
                      <Side report={match.found} caption="Found" />
                    </div>

                    <div className="flex items-center gap-4 lg:w-64 lg:justify-end">
                      <div className="min-w-0 flex-1 lg:flex-none">
                        <p className={cn(
                          'text-2xl font-extrabold tabular-nums',
                          scoreTone(match.finalScore) === 'success' ? 'text-emerald-600' : 'text-amber-600'
                        )}
                        >
                          {match.finalScore}%
                        </p>
                        <p className="text-[11px] font-semibold text-slate-400">{scoreLabel(match.finalScore)}</p>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={match.status} />
                        <p className="mt-1 text-[11px] text-slate-400">{formatDate(match.createdAt)}</p>
                      </div>
                    </div>
                  </div>

                  <Progress
                    className="mt-4"
                    color={scoreTone(match.finalScore) === 'success' ? 'success' : 'warning'}
                    value={match.finalScore || 0}
                  />

                  {match.explanation && (
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">{match.explanation}</p>
                  )}

                  <div className="mt-3">
                    <EvidenceSummary match={match} />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/organization/recovery/${match.id}`)}>
                      Open match <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      disabled={!canReview}
                      title={canReview ? undefined : 'Reviewing matches requires the match:review permission'}
                      onClick={() => openReview(match)}
                    >
                      Review decision
                    </Button>
                    {match.lostReportId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/organization/recovery?tab=reports&reportId=${match.lostReportId}`)}
                      >
                        {/* Show the human reference (LL-XXXX) rather than the raw
                            Mongo id, which meant nothing to a staff member. */}
                        Lost report{match.lost?.reference ? ` ${match.lost.reference}` : ''}
                      </Button>
                    )}
                    {match.foundReportId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/organization/recovery?tab=reports&reportId=${match.foundReportId}`)}
                      >
                        Found report{match.found?.reference ? ` ${match.found.reference}` : ''}
                      </Button>
                    )}
                    {match.reviewedAt && (
                      <span className="ml-auto text-[11px] text-slate-400">
                        Last reviewed {formatDate(match.reviewedAt)}
                        {match.reviewNotes ? ` · “${match.reviewNotes}”` : ''}
                      </span>
                    )}
                  </div>
                </motion.li>
              ))}
            </ul>
          )
        )
      )}

      {!canReview && matches.length > 0 && (
        <p className="mt-4 text-xs text-slate-400">
          You can read every match, but recording a decision requires the match:review permission.
        </p>
      )}

      <Modal
        open={Boolean(reviewing)}
        onClose={closeReview}
        title={reviewing ? `Review match ${reviewing.id}` : 'Review match'}
        description={reviewing ? `${itemName(reviewing.lost || {})} ↔ ${itemName(reviewing.found || {})} · ${reviewing.finalScore}% confidence` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={closeReview}>Cancel</Button>
            <Button disabled={!reviewing} onClick={() => setConfirming(true)}>
              Continue
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {ACTIONS.map((a) => {
              const Icon = a.icon;
              const selected = action === a.key;
              return (
                <button
                  key={a.key}
                  onClick={() => setAction(a.key)}
                  className={cn(
                    'rounded-xl border-2 p-3 text-left transition',
                    selected ? a.active : 'border-slate-200 bg-white hover:border-slate-300'
                  )}
                >
                  <span className={cn('flex items-center gap-2 text-sm font-bold', selected ? a.tone : 'text-slate-700')}>
                    <Icon className="h-4 w-4" /> {a.label}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-600">
            {ACTIONS.find((a) => a.key === action)?.blurb}
          </p>

          <div>
            <label htmlFor="match-notes" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
              Reviewer notes (shared with both counterparties)
            </label>
            <textarea
              id="match-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="e.g. Colour and brand line up; serial number differs, holding for a second look."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {reviewing?.evidence?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Signal breakdown</p>
              <ul className="space-y-2">
                {reviewing.evidence.map((e) => (
                  <li key={e.key} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-xs font-semibold text-slate-600">{e.label}</span>
                    <Progress
                      className="flex-1"
                      color={scoreTone(e.score) === 'success' ? 'success' : scoreTone(e.score) === 'warning' ? 'warning' : 'default'}
                      value={e.score || 0}
                    />
                    <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums text-slate-600">{e.score}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={submitReview}
        loading={saving}
        tone={action === 'reject' ? 'danger' : 'primary'}
        title={`${ACTIONS.find((a) => a.key === action)?.label} match ${reviewing?.id || ''}?`}
        description={`The match will be marked as ${statusLabel(
          action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'MANUAL_REVIEW'
        ).toLowerCase()} and both counterparties will be notified.`}
        confirmLabel={`${ACTIONS.find((a) => a.key === action)?.label} match`}
      />
    </div>
  );
}
