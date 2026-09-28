import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  Info,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Tag
} from 'lucide-react';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Progress } from '../components/ui/Progress';
import { Skeleton } from '../components/ui/Skeleton';
import { useOrganization } from '../context/OrganizationContext';
import { useMatch } from '../lib/queries';
import { cn } from '../lib/cn';
import { ItemThumb } from '../components/ItemThumb';
import {
  formatDate,
  formatDateTime,
  itemName,
  relativeTime,
  scoreLabel,
  scoreTone,
  statusLabel
} from '../lib/format';

/**
 * MatchDetail — the evidence behind a single AI candidate.
 *
 * Design rule for this page: never let a high number read as proof. The
 * confidence ring is deliberately paired with the per-signal breakdown and the
 * candidate-recommendation disclaimer, because a 92% visual score says nothing
 * about who the item belongs to — only a human verification can.
 */

const OPEN_STATUSES = ['POTENTIAL_MATCH', 'MATCHED', 'PENDING_VERIFICATION', 'MANUAL_REVIEW', 'PENDING', 'REVIEW'];
const READY_RETURN_STATUSES = ['READY', 'RETURN_READY'];

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

export default function MatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeOrganizationId } = useOrganization();
  const orgId = activeOrganizationId;

  const { data, error, refetch, isFetching } = useMatch(orgId, id);

  const match = data?.match;
  const lost = data?.lost;
  const found = data?.found;
  const returnCase = data?.returnCase;
  const verifications = useMemo(
    () => (Array.isArray(data?.verifications) ? data.verifications : []),
    [data]
  );

  const evidenceByKey = useMemo(() => {
    const map = new Map();
    const rows = Array.isArray(match?.evidence) ? match.evidence : [];
    rows.forEach((e, i) => map.set(e?.key || e?.type || `signal-${i}`, e));
    return map;
  }, [match]);

  const showSkeleton = !data && !error;
  const isMissing = Boolean(error) || (!showSkeleton && !match);

  if (showSkeleton) return <MatchDetailSkeleton />;

  if (isMissing) {
    const notFound = error?.status === 404;
    return (
      <div>
        <Link
          to="/matches"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Back to AI matches
        </Link>
        {error ? (
          <>
            <ErrorState
              error={error}
              title={notFound ? 'This match no longer exists' : undefined}
              onRetry={notFound ? undefined : () => refetch()}
            />
            {notFound && (
              <div className="mt-4 flex justify-center">
                <Button variant="secondary" onClick={() => navigate('/matches')}>
                  See all matches
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="card-surface">
            <EmptyState
              illustration="🤖"
              title="Match record unavailable"
              description="The match could not be assembled from its reports. It may have been created against a report that has since been removed."
              actionLabel="Back to AI matches"
              onAction={() => navigate('/matches')}
            />
          </div>
        )}
      </div>
    );
  }

  const finalScore = num(match.finalScore);
  const tone = scoreTone(finalScore);
  const isOpen = OPEN_STATUSES.includes(match.status);
  const hasReturn = Boolean(returnCase);
  const showVerify = Boolean(data?.canVerify) && isOpen && !hasReturn;
  const canShowReturnQr = hasReturn && READY_RETURN_STATUSES.includes(returnCase.status);

  return (
    <div className="stagger">
      <Link
        to="/matches"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to matches
      </Link>

      <PageHeader
        title="Match Analysis"
        eyebrow={itemName(lost)}
        subtitle={statusLabel(match.status)}
        badge={<StatusBadge status={match.status} />}
        actions={(
          <>
            <Button variant="secondary" onClick={() => navigate('/matches')}>
              All matches
            </Button>
            {showVerify && (
              <Button onClick={() => navigate(`/matches/${match.id}/verify`)}>
                <ShieldCheck className="h-4 w-4" /> Start verification
              </Button>
            )}
          </>
        )}
      />

      {/* ---- THE PAIR: lost + found, side by side --------------------
          Spec step 9: show the two items, then the analysis between them.
          A soft gradient band joins the two halves so they read as one
          comparison rather than two separate cards. */}
      <div className="card-surface overflow-hidden">
        <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
          <ReportSide report={lost} caption="Reported lost" accent="rose" />
          <ReportSide report={found} caption="Reported found" accent="teal" />
        </div>
        {/* AI Match Analysis connector */}
        <div className="flex items-center justify-center gap-3 bg-gradient-to-r from-brand-50 via-white to-accent-50 px-5 py-3">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-brand-200" />
          <span className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-700">
            <Sparkles className="h-3.5 w-3.5" /> AI Match Analysis
          </span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-accent-200" />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Card className="flex flex-col items-center justify-center gap-4 text-center">
          <ConfidenceRing score={finalScore} tone={tone} />
          <div>
            <p className="text-sm font-bold text-slate-900">{scoreLabel(finalScore)}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Match reference <span className="font-mono font-semibold text-slate-700">{match.id}</span>
            </p>
          </div>
          {isFetching && <p className="text-[11px] text-slate-400">Refreshing evidence…</p>}
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">
                Why does LostLink think these items may match?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {match.explanation || 'No narrative explanation was stored for this candidate. Review the individual signals below before deciding.'}
              </p>
            </div>
          </div>

          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              {data?.disclaimer
                || 'An AI match is a candidate recommendation, not proof of ownership. Scores rank candidates for human review only.'}
            </span>
          </p>

          {hasReturn && (
            <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <PackageCheck className="h-4 w-4 text-brand-700" />
                <p className="text-sm font-bold text-brand-900">Return case opened</p>
                <StatusBadge status={returnCase.status} />
              </div>
              <p className="mt-2 text-xs text-brand-900/80">
                Pickup location: <span className="font-semibold">{returnCase.pickupLocation || 'To be confirmed by staff'}</span>
              </p>
              {canShowReturnQr ? (
                <Button size="sm" className="mt-3" onClick={() => navigate(`/recovery/${returnCase.id}/qr`)}>
                  View pickup QR
                </Button>
              ) : (
                <p className="mt-2 text-xs text-brand-900/60">
                  The pickup code appears once staff mark the item ready for handover.
                </p>
              )}
            </div>
          )}

          {showVerify && (
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-relaxed text-slate-600">
                Recognise the item? Answer a few ownership questions to release it for a secure,
                verified handover.
              </p>
              <Button size="sm" onClick={() => navigate(`/matches/${match.id}/verify`)}>
                Start verification
              </Button>
            </div>
          )}

          {!showVerify && !hasReturn && isOpen && (
            <p className="text-xs text-slate-500">
              Only the person who reported the lost item can start the ownership verification for this candidate.
            </p>
          )}

          {!isOpen && !hasReturn && (
            <p className="text-xs text-slate-500">
              This candidate is {statusLabel(match.status).toLowerCase()} and is no longer open for a new verification.
            </p>
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <SectionTitle
          icon={<Sparkles className="h-4 w-4" />}
          title="Signal evidence"
          subtitle="Every signal the matcher scored, with the source it was derived from."
        />
        {Array.isArray(match.evidence) && match.evidence.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {match.evidence.map((e, i) => (
              <EvidenceCard key={e?.key || e?.type || i} evidence={e} index={i} />
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
            No per-signal evidence was stored for this candidate.
          </p>
        )}
      </Card>

      <Card className="mt-5">
        <SectionTitle
          icon={<Tag className="h-4 w-4" />}
          title="Score breakdown"
          subtitle="The stored sub-scores that produced the weighted match confidence."
        />
        <div className="stagger-fast mt-4 space-y-3.5">
          {SIGNALS.map((signal) => {
            const raw = match[signal.field];
            const stored = evidenceByKey.get(signal.key);
            const value = pct(raw);
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
                <div className="mt-1.5">
                  <Progress value={value} color={toneMap.bar} />
                </div>
                {(stored?.detail || stored?.source) && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    {stored?.detail}
                    {stored?.detail && stored?.source ? ' · ' : ''}
                    {stored?.source ? `Source: ${stored.source}` : ''}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {verifications.length > 0 && (
        <Card className="mt-5">
          <SectionTitle
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Verification history"
            subtitle="Ownership challenges recorded against this candidate."
          />
          <ul className="mt-4 divide-y divide-slate-100">
            {verifications.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <StatusBadge status={v.status} />
                  <span className="text-xs text-slate-500">Attempt {v.id}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  {v.verificationScore !== null && v.verificationScore !== undefined && (
                    <span className="font-bold tabular-nums text-slate-700">{num(v.verificationScore).toFixed(1)}%</span>
                  )}
                  <span>{formatDateTime(v.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function ReportSide({ report, caption, accent }) {
  const profile = report?.itemProfile || {};
  const facts = [
    { label: 'Category', value: profile.category || report?.category },
    { label: 'Brand', value: profile.brand },
    { label: 'Colour', value: profile.color },
    { label: 'Distinctive mark', value: profile.distinctiveMark }
  ].filter((f) => f.value);

  const accentClass = accent === 'rose'
    ? 'bg-rose-50 text-rose-600'
    : 'bg-brand-50 text-brand-700';

  return (
    <div className="bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider', accentClass)}>
          {caption}
        </span>
        {report?.status && <StatusBadge status={report.status} />}
      </div>

      {/* v2: image floats on a tinted bed instead of sitting inside a border. */}
      <div className="mt-4 aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 to-brand-50/70">
        <ItemThumb report={report} className="h-full w-full" rounded="" iconClass="h-7 w-7" />
      </div>

      <h3 className="mt-4 text-base font-bold text-slate-900">{itemName(report)}</h3>
      {report?.description && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{report.description}</p>
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

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100/80 pt-3 text-[11px] text-slate-400">
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

  // v2 evidence chips: compact tiles on a tinted band, no border, the strength
  // band (High/Medium/Low) is the headline. The raw percentage is secondary -
  // a number without a band invites over-reading.
  return (
    <div className="rounded-2xl bg-slate-50/80 p-4 transition-colors hover:bg-slate-100/70">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">{label}</p>
        <StatusBadge tone={toneMap.chip} label={strength} dot={false} />
      </div>
      <div className="mt-2.5 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold tabular-nums tracking-tight text-slate-900">{value}%</span>
        {weight !== null && weight > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            weight {Math.round(weight * 100)}%
          </span>
        )}
      </div>
      <div className="mt-2">
        <Progress value={value} color={toneMap.bar} />
      </div>
      {evidence?.detail && (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{evidence.detail}</p>
      )}
      {evidence?.source && (
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {evidence.source}
        </p>
      )}
    </div>
  );
}

function ConfidenceRing({ score, tone }) {
  const value = Math.max(0, Math.min(100, num(score)));
  const size = 168;
  const stroke = 13;
  const radius = (size - stroke) / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const strokeColor = { success: '#14b8a6', warning: '#f59e0b', default: '#94a3b8' }[tone] || '#14b8a6';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={`Match confidence ${value.toFixed(1)} percent`}
      >
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-extrabold tabular-nums tracking-tight text-slate-900">
          {value.toFixed(1)}%
        </span>
        <span className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
          Confidence
        </span>
      </div>
    </div>
  );
}

function MatchDetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-9 w-64" />
      <div className="card-surface grid gap-px overflow-hidden bg-slate-200/70 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-3 bg-white p-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="aspect-[4/3] w-full" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Card className="flex flex-col items-center gap-4">
          <Skeleton className="h-[176px] w-[176px] rounded-full" />
          <Skeleton className="h-4 w-40" />
        </Card>
        <Card className="space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-16 w-full" />
        </Card>
      </div>
    </div>
  );
}
