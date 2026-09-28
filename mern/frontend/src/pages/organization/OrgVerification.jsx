import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  CheckCircle2,
  HelpCircle,
  MessageSquareWarning,
  ShieldCheck,
  XCircle
} from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { useVerifications } from '../../lib/queries';
import api from '../../lib/api';
import { useToast, Modal, ConfirmDialog } from '../../components/Toast';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';
import { Button } from '../../components/ui/Button';
import { Progress } from '../../components/ui/Progress';
import { SkeletonList } from '../../components/ui/Skeleton';
import { formatDateTime, relativeTime, scoreTone } from '../../lib/format';
import { cn } from '../../lib/cn';

const STATUS_FILTERS = [
  { value: '', label: 'All verifications' },
  { value: 'PENDING', label: 'Awaiting an answer' },
  { value: 'REVIEW', label: 'Sent for review' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'REJECTED', label: 'Rejected' }
];

const DECISIONS = [
  {
    key: 'approve',
    label: 'Approve',
    icon: CheckCircle2,
    blurb: 'Marks ownership as verified and moves the linked lost report to Verified, ready for return authorisation.'
  },
  {
    key: 'request-more',
    label: 'Request more',
    icon: MessageSquareWarning,
    blurb: 'Sends the case back for a human look. The claimant is asked to supply more detail.'
  },
  {
    key: 'reject',
    label: 'Reject',
    icon: XCircle,
    blurb: 'Records that ownership could not be proven. The claimant is notified.'
  }
];

/**
 * OrgVerification — staff review queue for ownership challenges.
 * Endpoints: GET /api/verifications (status) and POST /api/verifications/:id/review.
 * Renders at both /organization/verification and /organization/verification/:id
 * (the id form opens the review sheet for that case directly).
 */
export default function OrgVerification() {
  const navigate = useNavigate();
  const { id: routeVerificationId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { activeOrganizationId, permissions } = useOrganization();

  const canReview = permissions.includes('verification:review');

  const [status, setStatus] = useState('');
  const [target, setTarget] = useState(null);
  const [action, setAction] = useState('approve');
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, isError, error, refetch } = useVerifications(activeOrganizationId, {
    status: status || undefined
  });

  const verifications = data?.verifications || [];
  const total = data?.total ?? verifications.length;

  // Deep link support: /organization/verification/:id opens that case.
  useEffect(() => {
    if (!routeVerificationId) return;
    const match = verifications.find((v) => String(v.id) === String(routeVerificationId));
    if (match) setTarget(match);
  }, [routeVerificationId, verifications]);

  const counts = useMemo(() => ({
    pending: verifications.filter((v) => v.status === 'PENDING').length,
    review: verifications.filter((v) => v.status === 'REVIEW').length,
    verified: verifications.filter((v) => v.status === 'VERIFIED').length
  }), [verifications]);

  const openReview = (verification) => {
    setTarget(verification);
    setAction('approve');
    setNotes('');
  };

  const closeReview = () => {
    setTarget(null);
    setNotes('');
    setAction('approve');
    if (routeVerificationId) navigate('/organization/verification', { replace: true });
  };

  const submit = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const res = await api.reviewVerification(target.id, { action, notes: notes.trim() || undefined });
      toast.success(res?.message || 'Verification reviewed');
      setConfirming(false);
      closeReview();
      qc.invalidateQueries({ queryKey: ['verifications', activeOrganizationId] });
      qc.invalidateQueries({ queryKey: ['matches', activeOrganizationId] });
      qc.invalidateQueries({ queryKey: ['reports', activeOrganizationId] });
      qc.invalidateQueries({ queryKey: ['org-analytics', activeOrganizationId] });
    } catch (err) {
      toast.error(err?.message || 'Could not record the decision');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Ownership verification"
        subtitle="Challenges issued to claimants, and the decisions staff recorded on them."
        actions={(
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 focus:border-brand-300 focus:outline-none"
          >
            {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        )}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="In this view"
          value={total}
          icon={<ShieldCheck className="h-5 w-5" />}
          color="violet"
          loading={isLoading}
          description="Verification records"
        />
        <StatCard
          label="Needs staff"
          value={counts.pending + counts.review}
          icon={<HelpCircle className="h-5 w-5" />}
          color="amber"
          loading={isLoading}
          description="Pending an answer or held for review"
        />
        <StatCard
          label="Verified"
          value={counts.verified}
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="emerald"
          loading={isLoading}
          description="Cleared for return authorisation"
        />
      </div>

      {isError && <ErrorState error={error} onRetry={() => refetch()} />}

      {isLoading ? (
        <SkeletonList count={4} />
      ) : (
        !isError && (
          verifications.length === 0 ? (
            <div className="card-surface">
              <EmptyState
                illustration="🛡️"
                title={status ? 'No verifications with that status' : 'No ownership challenges yet'}
                description={status
                  ? 'Clear the status filter to see every verification raised in this organization.'
                  : 'A verification is created when the owner of a lost item starts the verification flow on a candidate match. Cases then appear here for a decision.'}
                actionLabel={status ? 'Clear filter' : undefined}
                onAction={status ? () => setStatus('') : undefined}
              />
            </div>
          ) : (
            <ul className="space-y-4">
              {verifications.map((verification, i) => {
                const score = verification.verificationScore;
                const isOpen = String(target?.id) === String(verification.id);
                return (
                  <motion.li
                    key={verification.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.25) }}
                    className={cn('card-surface p-5', isOpen && 'ring-2 ring-brand-200')}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-500">{verification.id}</span>
                          <StatusBadge status={verification.status} />
                          {verification.matchId && (
                            <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold text-violet-700">
                              match {verification.matchId}
                            </span>
                          )}
                        </div>

                        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                          <div>
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Claimant</dt>
                            <dd className="mt-0.5 truncate font-semibold text-slate-800">{verification.claimantUserId || '—'}</dd>
                          </div>
                          <div>
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Report</dt>
                            <dd className="mt-0.5 truncate font-semibold text-slate-800">{verification.reportId || '—'}</dd>
                          </div>
                          <div>
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Opened</dt>
                            <dd className="mt-0.5 font-semibold text-slate-800">{relativeTime(verification.createdAt)}</dd>
                          </div>
                        </dl>

                        {score != null && (
                          <div className="mt-4 max-w-sm">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-500">Answer score</span>
                              <span className="text-sm font-extrabold tabular-nums text-slate-900">{score}%</span>
                            </div>
                            <Progress
                              className="mt-1.5"
                              color={scoreTone(score) === 'success' ? 'success' : scoreTone(score) === 'warning' ? 'warning' : 'default'}
                              value={score}
                            />
                          </div>
                        )}

                        {verification.claimantAnswer && (
                          <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Claimant answer</p>
                            <p className="mt-1 text-sm text-slate-700">{verification.claimantAnswer}</p>
                          </div>
                        )}

                        {verification.challenge?.question && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-bold text-brand-700">Show the challenge asked</summary>
                            <p className="mt-2 rounded-xl bg-brand-50/60 p-3 text-sm text-slate-700">
                              {verification.challenge.question}
                            </p>
                            {verification.challenge.hint && (
                              <p className="mt-1 text-xs text-slate-500">Hint given: {verification.challenge.hint}</p>
                            )}
                          </details>
                        )}

                        {verification.reviewNotes && (
                          <p className="mt-3 text-xs text-slate-500">
                            Last reviewer note: “{verification.reviewNotes}”
                            {verification.reviewedAt ? ` · ${formatDateTime(verification.reviewedAt)}` : ''}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2 lg:w-56 lg:flex-col lg:items-stretch">
                        <Button
                          size="sm"
                          disabled={!canReview}
                          title={canReview ? undefined : 'Reviewing verifications requires the verification:review permission'}
                          onClick={() => openReview(verification)}
                        >
                          Review case
                        </Button>
                        {verification.reportId && (
                          <Button variant="secondary" size="sm" onClick={() => navigate(`/organization/recovery?tab=reports&reportId=${verification.reportId}`)}>
                            Report <ArrowUpRight className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {verification.matchId && (
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/organization/recovery/${verification.matchId}`)}>
                            Match
                          </Button>
                        )}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )
        )
      )}

      {!canReview && verifications.length > 0 && (
        <p className="mt-4 text-xs text-slate-400">
          Recording a decision requires the verification:review permission.
        </p>
      )}

      <Modal
        open={Boolean(target)}
        onClose={closeReview}
        title={target ? `Review verification ${target.id}` : 'Review verification'}
        description={target
          ? `Claimant ${target.claimantUserId || 'unknown'} · report ${target.reportId || 'unknown'} · answer score ${target.verificationScore ?? 'not scored yet'}`
          : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={closeReview}>Cancel</Button>
            <Button disabled={!target} onClick={() => setConfirming(true)}>Continue</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {DECISIONS.map((d) => {
              const Icon = d.icon;
              const selected = action === d.key;
              return (
                <button
                  key={d.key}
                  onClick={() => setAction(d.key)}
                  className={cn(
                    'rounded-xl border-2 p-3 text-left transition',
                    selected
                      ? d.key === 'approve'
                        ? 'border-emerald-500 bg-emerald-50'
                        : d.key === 'reject'
                          ? 'border-rose-500 bg-rose-50'
                          : 'border-amber-500 bg-amber-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  )}
                >
                  <span className={cn(
                    'flex items-center gap-2 text-sm font-bold',
                    selected
                      ? d.key === 'approve' ? 'text-emerald-700' : d.key === 'reject' ? 'text-rose-700' : 'text-amber-700'
                      : 'text-slate-700'
                  )}
                  >
                    <Icon className="h-4 w-4" /> {d.label}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-600">
            {DECISIONS.find((d) => d.key === action)?.blurb}
          </p>

          {target?.claimantAnswer && (
            <div className="rounded-xl border border-slate-200 p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">What the claimant said</p>
              <p className="mt-1 text-sm text-slate-700">{target.claimantAnswer}</p>
              <p className="mt-1 text-[11px] text-slate-400">Attempt {target.attempts || 1} of {target.maxAttempts || 3}</p>
            </div>
          )}

          <div>
            <label htmlFor="verification-notes" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
              Notes for the claimant
            </label>
            <textarea
              id="verification-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Explain the decision, or what extra detail would settle it."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={submit}
        loading={saving}
        tone={action === 'reject' ? 'danger' : 'primary'}
        title={`${DECISIONS.find((d) => d.key === action)?.label} verification ${target?.id || ''}?`}
        description="The claimant is notified immediately and, when approved, the linked report moves to Verified."
        confirmLabel="Record decision"
      />
    </div>
  );
}
