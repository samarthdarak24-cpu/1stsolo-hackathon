/**
 * OrgMatchDetail — the staff-facing evidence behind a single AI candidate.
 *
 * Endpoints: GET /api/matches/:id and POST /api/matches/:id/review.
 *
 * Design rule carried over from the member-facing MatchDetail page: a high score
 * is never presented as proof. The confidence figure always sits beside the
 * per-signal breakdown, the stored explanation, and the candidate-recommendation
 * disclaimer, because only a human verification can establish ownership.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  CalendarDays,
  CheckCircle2,
  Flag,
  Info,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Tag,
  User
} from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { useMatch } from '../../lib/queries';
import api from '../../lib/api';
import { useToast, ConfirmDialog, Modal } from '../../components/Toast';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';
import Timeline from '../../components/Timeline';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Progress } from '../../components/ui/Progress';
import { Skeleton } from '../../components/ui/Skeleton';
import {
  formatDate,
  formatDateTime,
  itemName,
  relativeTime,
  scoreLabel,
  scoreTone,
  statusLabel
} from '../../lib/format';
import { cn } from '../../lib/cn';
import { ItemThumb } from '../../components/ItemThumb';

/** One side of the comparison: the lost or the found report, as staff see it. */
function ReportSide({ report, caption, accent }) {
  const profile = report?.itemProfile || {};
  const facts = [
    { label: 'Category', value: profile.category || report?.category },
    { label: 'Brand', value: profile.brand },
    { label: 'Colour', value: profile.primaryColor },
    { label: 'Distinctive mark', value: profile.visibleMark }
  ].filter((f) => f.value);

  const accentClass = accent === 'rose'
    ? 'border-rose-200 bg-rose-50 text-rose-600'
    : 'border-brand-200 bg-brand-50 text-brand-700';

  return (
    <div className="bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn('rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider', accentClass)}>
          {caption}
        </span>
        {report?.status && <StatusBadge status={report.status} />}
      </div>

      <div className="mt-4 aspect-[4/3] overflow-hidden rounded-2xl border border-slate-200 bg-brand-50/40">
        <ItemThumb report={report} className="h-full w-full" rounded="" iconClass="h-7 w-7" />
      </div>

      <h3 className="mt-4 text-base font-bold text-slate-900">{itemName(report)}</h3>
      {report?.description && (
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{report.description}</p>
      )}

      <dl className="mt-3 space-y-1.5">
        {facts.map((fact) => (
          <div key={fact.label} className="flex items-start justify-between gap-3 text-xs">
            <dt className="shrink-0 font-bold uppercase tracking-wide text-slate-400">{fact.label}</dt>
            <dd className="text-right font-semibold text-slate-700">{fact.value}</dd>
          </div>
        ))}
        <div className="flex items-start justify-between gap-3 text-xs">
          <dt className="flex shrink-0 items-center gap-1 font-bold uppercase tracking-wide text-slate-400">
            <MapPin className="h-3 w-3" /> Location
          </dt>
          <dd className="text-right font-semibold text-slate-700">{report?.location || 'Not shared'}</dd>
        </div>
      </dl>

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3 w-3" /> Reported {formatDate(report?.createdAt)}
        </span>
        {report?.reference && <span className="font-mono">Ref {report.reference}</span>}
      </p>
    </div>
  );
}

function EvidenceCard({ evidence, index }) {
  const label = evidence?.label
    || String(evidence?.type || evidence?.key || `Signal ${index + 1}`)
      .replace(/[_-]+/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());
  const value = pct(evidence?.score);
  const strength = evidence?.strength || strengthFor(value);
  const toneMap = STRENGTH_TONE[strength] || STRENGTH_TONE.Weak;
  const weight = typeof evidence?.weight === 'number' ? evidence.weight : null;

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
          {evidence?.detail && <p className="mt-1 text-xs leading-relaxed text-slate-500">{evidence.detail}</p>}
        </div>
        <span className="shrink-0 text-sm font-extrabold tabular-nums text-slate-900">{value}%</span>
      </div>
      <Progress className="mt-3" color={toneMap.bar} value={value} />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatusBadge tone={toneMap.chip} label={strength} dot={false} />
        {weight != null && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            weight {Math.round(weight * 100)}%
          </span>
        )}
        {evidence?.source && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">via {evidence.source}</span>
        )}
      </div>
    </div>
  );
}

function MatchDetailSkeleton() {
  return (
    <div>
      <Skeleton className="mb-4 h-4 w-40" />
      <Skeleton className="mb-6 h-9 w-72" />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-72 rounded-3xl" />
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    </div>
  );
}

const SIGNALS = [
  { key: 'visual', field: 'visualScore', label: 'Visual similarity' },
  { key: 'semantic', field: 'semanticScore', label: 'Description similarity' },
  { key: 'attributes', field: 'attributeScore', label: 'Attribute match' },
  { key: 'category', field: 'categoryScore', label: 'Category' },
  { key: 'location', field: 'locationScore', label: 'Location' },
  { key: 'time', field: 'timeScore', label: 'Timing' },
  { key: 'context', field: 'contextScore', label: 'Context' }
];

const STRENGTH_TONE = {
  Exact: { bar: 'success', chip: 'success' },
  Strong: { bar: 'success', chip: 'success' },
  Likely: { bar: 'warning', chip: 'warning' },
  Weak: { bar: 'default', chip: 'default' },
  Mismatch: { bar: 'danger', chip: 'danger' }
};

const ACTIONS = [
  {
    key: 'approve',
    label: 'Approve',
    icon: CheckCircle2,
    blurb: 'Confirms the found item is the reported lost item and moves it to the verification step.'
  },
  {
    key: 'reject',
    label: 'Reject',
    icon: Ban,
    blurb: 'Marks the candidate as a false positive. The person who reported the loss is notified.'
  },
  {
    key: 'escalate',
    label: 'Escalate',
    icon: Flag,
    blurb: 'Flags the candidate for a human reviewer to look at later.'
  }
];

const OPEN_STATUSES = ['POTENTIAL_MATCH', 'MATCHED', 'PENDING_VERIFICATION', 'MANUAL_REVIEW', 'PENDING', 'REVIEW'];

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const pct = (value) => Math.max(0, Math.min(100, Math.round(num(value))));

/** Mirrors the server's own strength banding so the UI never invents a label. */
function strengthFor(score) {
  if (score >= 90) return 'Exact';
  if (score >= 75) return 'Strong';
  if (score >= 55) return 'Likely';
  if (score >= 35) return 'Weak';
  return 'Mismatch';
}

function SectionTitle({ icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-2.5">
      {icon && <span className="mt-0.5 text-brand-600">{icon}</span>}
      <div className="min-w-0">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function OrgMatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { activeOrganizationId, permissions } = useOrganization();

  const canReview = permissions.includes('match:review');

  const [reviewing, setReviewing] = useState(false);
  const [action, setAction] = useState('approve');
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data, error, refetch, isLoading } = useMatch(activeOrganizationId, id);

  const match = data?.match;
  const lost = data?.lost;
  const found = data?.found;
  const returnCase = data?.returnCase;
  const verifications = Array.isArray(data?.verifications) ? data.verifications : [];

  const evidenceByKey = useMemo(() => {
    const map = new Map();
    const rows = Array.isArray(match?.evidence) ? match.evidence : [];
    rows.forEach((e, i) => map.set(e?.key || e?.type || `signal-${i}`, e));
    return map;
  }, [match]);

  /* Both reports carry a date; a candidate only makes sense when the find
     happened after the loss, so that ordering is surfaced rather than assumed. */
  const ordering = useMemo(() => {
    const lostAt = lost?.lostAt || lost?.createdAt;
    const foundAt = found?.foundAt || found?.createdAt;
    if (!lostAt || !foundAt) return null;
    return { lostAt, foundAt, consistent: new Date(foundAt) >= new Date(lostAt) };
  }, [lost, found]);

  /* The recovery stage this candidate sits at, derived only from values the
     server actually returned. A rejected candidate stops at the decision. */
  const stages = useMemo(() => {
    const list = [
      { key: 'REPORTED', label: 'Lost item reported', at: lost?.createdAt, state: 'done' },
      { key: 'FOUND', label: 'Found item reported', at: found?.createdAt, state: 'done' },
      { key: 'POTENTIAL_MATCH', label: 'Candidate paired by LostLink AI', at: match?.createdAt, state: 'done' },
      {
        key: 'VERIFICATION_PENDING',
        label: 'Ownership verification',
        at: verifications[0]?.createdAt,
        state: verifications.length ? 'done' : 'current'
      },
      {
        key: 'RETURN_READY',
        label: 'Authorised for handover',
        at: returnCase?.createdAt,
        state: returnCase ? 'done' : 'upcoming'
      },
      {
        key: 'RETURNED',
        label: 'Returned to the owner',
        at: returnCase?.usedAt,
        state: returnCase?.status === 'COMPLETED' ? 'done' : 'upcoming'
      }
    ];
    // Showing a live recovery pipeline for a dismissed false positive would
    // misrepresent where the item actually is.
    if (match?.status === 'REJECTED') {
      return [
        ...list.slice(0, 3),
        { key: 'REJECTED', label: 'Candidate rejected by staff', at: match.reviewedAt, state: 'done' }
      ];
    }
    return list;
  }, [lost, found, match, verifications, returnCase]);

  const submitReview = async () => {
    if (!match) return;
    setSaving(true);
    try {
      const res = await api.reviewMatch(match.id, { action, notes: notes.trim() || undefined });
      toast.success(res?.message || 'Review recorded');
      setConfirming(false);
      setReviewing(false);
      setNotes('');
      setAction('approve');
      qc.invalidateQueries({ queryKey: ['match', activeOrganizationId, match.id] });
      qc.invalidateQueries({ queryKey: ['matches', activeOrganizationId] });
      qc.invalidateQueries({ queryKey: ['org-analytics', activeOrganizationId] });
    } catch (err) {
      toast.error(err?.message || 'Could not record the review');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading && !data) return <MatchDetailSkeleton />;

  if (error) {
    const notFound = error.status === 404;
    return (
      <div>
        <Link
          to="/organization/recovery?tab=matches"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Back to AI matching
        </Link>
        <ErrorState
          error={error}
          title={notFound ? 'This match no longer exists' : undefined}
          onRetry={notFound ? undefined : () => refetch()}
        />
        {notFound && (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={() => navigate('/organization/recovery?tab=matches')}>
              See all candidates
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (!match) {
    return (
      <div className="card-surface">
        <EmptyState
          illustration="🤖"
          title="Match record unavailable"
          description="The candidate could not be assembled from its reports. It may reference a report that has since been removed."
          actionLabel="Back to AI matching"
          onAction={() => navigate('/organization/recovery?tab=matches')}
        />
      </div>
    );
  }

  const finalScore = num(match.finalScore);
  const tone = scoreTone(finalScore);
  const isOpen = OPEN_STATUSES.includes(match.status);
  const decided = ['APPROVED', 'REJECTED', 'VERIFIED'].includes(match.status);
  const evidenceRows = Array.isArray(match.evidence) ? match.evidence : [];
  const chosenAction = ACTIONS.find((a) => a.key === action) || ACTIONS[0];

      toast.success(res?.message || 'Review recorded');
      setConfirming(false);

  return (
    <div>
      <Link
        to="/organization/recovery?tab=matches"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to AI matching
      </Link>

      <PageHeader
        title={itemName(lost)}
        subtitle={`${statusLabel(match.status)} · candidate created ${relativeTime(match.createdAt) || formatDate(match.createdAt)}`}
        badge={<StatusBadge status={match.status} />}
        actions={(
          <>
            <Button variant="secondary" onClick={() => navigate('/organization/recovery?tab=matches')}>
              All candidates
            </Button>
            {lost?.id && (
              <Button variant="secondary" onClick={() => navigate(`/organization/recovery?tab=reports&reportId=${lost.id}`)}>
                Lost report
              </Button>
            )}
            {isOpen && (
              <Button
                disabled={!canReview}
                title={canReview ? undefined : 'Reviewing matches requires the match:review permission'}
                onClick={() => setReviewing(true)}
              >
                <Sparkles className="h-4 w-4" /> Record a decision
              </Button>
            )}
          </>
        )}
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Match confidence"
          value={`${finalScore}%`}
          icon={<Sparkles className="h-5 w-5" />}
          color={tone === 'success' ? 'emerald' : 'amber'}
          description={scoreLabel(finalScore)}
        />
        <StatCard
          label="Signals scored"
          value={SIGNALS.length}
          icon={<Tag className="h-5 w-5" />}
          color="sky"
          description={`${evidenceRows.length} with stored evidence`}
        />
        <StatCard
          label="Verifications"
          value={verifications.length}
          icon={<ShieldCheck className="h-5 w-5" />}
          color="violet"
          description={verifications.length
            ? verifications.map((v) => statusLabel(v.status)).join(', ')
            : 'No ownership check started'}
        />
        <StatCard
          label="Return case"
          value={returnCase ? statusLabel(returnCase.status) : '—'}
          icon={<PackageCheck className="h-5 w-5" />}
          color={returnCase ? 'emerald' : 'slate'}
          description={returnCase?.pickupLocation ? `Pickup at ${returnCase.pickupLocation}` : 'Not opened yet'}
        />
      </div>

      <div className="card-surface overflow-hidden">
        <div className="grid gap-px bg-slate-200/70 sm:grid-cols-2">
          <ReportSide report={lost} caption="Reported lost" accent="rose" />
          <ReportSide report={found} caption="Reported found" accent="emerald" />
        </div>
      </div>

      {ordering && !ordering.consistent && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            The found item was reported {formatDateTime(ordering.foundAt)}, before the lost item was reported{' '}
            {formatDateTime(ordering.lostAt)}. Check the dates on both reports before approving.
          </span>
        </p>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <Card className="flex flex-col gap-5">
          <SectionTitle
            icon={<Sparkles className="h-5 w-5" />}
            title="Why LostLink paired these items"
            subtitle="The stored explanation, shown exactly as the matcher produced it."
          />
          <p className="text-sm leading-relaxed text-slate-600">
            {match.explanation
              || 'No narrative explanation was stored for this candidate. Review the individual signals before deciding.'}
          </p>

          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              {data?.disclaimer
                || 'An AI match is a candidate recommendation, not proof of ownership. Scores rank candidates for human review only.'}
            </span>
          </p>

          <div className="stagger-fast space-y-3.5 border-t border-slate-100 pt-5">
            {SIGNALS.map((signal) => {
              const stored = evidenceByKey.get(signal.key);
              const value = pct(match[signal.field]);
              const strength = stored?.strength || strengthFor(value);
              const toneMap = STRENGTH_TONE[strength] || STRENGTH_TONE.Weak;
              const weight = stored?.weight ?? match?.weights?.[signal.key];

              return (
                <div key={signal.key}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{signal.label}</span>
                      <StatusBadge tone={toneMap.chip} label={strength} dot={false} />
                      {typeof weight === 'number' && weight > 0 && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          weight {Math.round(weight * 100)}%
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-bold tabular-nums text-slate-900">{value}%</span>
                  </div>
                  <Progress className="mt-1.5" color={toneMap.bar} value={value} />
                  {stored?.detail && (
                    <p className="mt-1 text-[11px] text-slate-400">{stored.detail}</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card padding="md">
            <SectionTitle
              icon={<CalendarDays className="h-5 w-5" />}
              title="Recovery timeline"
              subtitle="Every stage the server has actually recorded."
            />
            <Timeline className="mt-4" steps={stages} />
          </Card>

          <Card padding="md">
            <SectionTitle
              icon={<User className="h-5 w-5" />}
              title="Review record"
              subtitle="Who decided this candidate, and why."
            />
            {match.reviewedAt ? (
              <dl className="mt-4 space-y-2 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <dt className="font-bold uppercase tracking-wide text-slate-400">Decided</dt>
                  <dd className="text-right font-semibold text-slate-700">{formatDateTime(match.reviewedAt)}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="font-bold uppercase tracking-wide text-slate-400">Outcome</dt>
                  <dd className="text-right"><StatusBadge status={match.status} /></dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wide text-slate-400">Notes</dt>
                  <dd className="mt-1 leading-relaxed text-slate-600">
                    {match.reviewNotes || 'No notes were recorded with this decision.'}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-500">
                No staff decision has been recorded for this candidate yet.
              </p>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <SectionTitle
          icon={<Tag className="h-4 w-4" />}
          title="Signal evidence"
          subtitle="Every signal the matcher scored, with the source it was derived from."
        />
        {evidenceRows.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {evidenceRows.map((e, i) => (
              <EvidenceCard key={e?.key || e?.type || i} evidence={e} index={i} />
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
            No per-signal evidence was stored for this candidate. Only the weighted score is available.
          </p>
        )}
      </Card>

      {decided && (
        <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
          This candidate has already been {statusLabel(match.status).toLowerCase()}. Recording a new decision
          replaces the previous outcome and is written to the audit log.
        </p>
      )}

      {/* Decision modal — the same three actions the queue offers, so staff see
          one vocabulary wherever they review a candidate. */}
      <Modal
        open={reviewing}
        onClose={() => { setReviewing(false); setNotes(''); }}
        title="Record a decision"
        description="Your decision is written to the audit log and the person who reported the loss is notified."
      >
        <div className="space-y-3">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            const selected = action === a.key;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => setAction(a.key)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition',
                  selected ? 'border-brand-400 bg-brand-50/60 ring-1 ring-brand-200' : 'border-slate-200 hover:bg-slate-50'
                )}
              >
                <span className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                  selected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'
                )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900">{a.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{a.blurb}</span>
                </span>
              </button>
            );
          })}

          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Notes (optional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="What did you check before deciding? This is stored with the audit entry."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => { setReviewing(false); setNotes(''); }}>
              Cancel
            </Button>
            <Button onClick={() => setConfirming(true)}>Save decision</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={submitReview}
        loading={saving}
        tone={action === 'reject' ? 'danger' : 'primary'}
        title={`${chosenAction.label} this candidate?`}
        description={
          action === 'reject'
            ? 'The candidate is marked as a false positive and the reporter is notified. Neither report is deleted, and the decision is written to the audit log.'
            : action === 'escalate'
              ? 'The candidate is flagged for another reviewer and stays open for a decision.'
              : 'The found item is confirmed as the reported lost item and moves to ownership verification.'
        }
        confirmLabel={chosenAction.label}
      />
    </div>
  );
}
