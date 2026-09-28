import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Check,
  Copy,
  FileText,
  Hourglass,
  Info,
  KeyRound,
  Lock,
  MapPin,
  QrCode,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  TimerReset
} from 'lucide-react';
import ErrorState from '../components/ErrorState';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import api from '../lib/api';
import { qk, useReport, useReturn } from '../lib/queries';
import { useOrganization } from '../context/OrganizationContext';
import { cn } from '../lib/cn';
import { formatDateTime, itemName, relativeTime } from '../lib/format';
import { ItemThumb } from '../components/ItemThumb';

/**
 * ReturnQr — the secure handover screen.
 *
 * Security posture for this page:
 *  - The QR image is only ever shown to the verified owner. Staff get the case
 *    details but never the owner's live code.
 *  - The token is opaque, expires on the server, and is single-use: this page
 *    never invents a fallback QR, it tells the user to request a new one.
 */

const time = (value) => {
  const t = value ? new Date(value).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

function pad(value) {
  return String(value).padStart(2, '0');
}

function countdown(remainingMs) {
  if (remainingMs === null) return { expired: false, text: '—' };
  if (remainingMs <= 0) return { expired: true, text: '00:00' };
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    expired: false,
    text: hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
  };
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  return ok;
}

export default function ReturnQr() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { activeOrganization, activeOrganizationId } = useOrganization();
  const orgId = activeOrganizationId;

  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data, error, refetch } = useReturn(orgId, id);
  const returnCase = data?.returnCase;
  const reportId = returnCase?.reportId;

  // The item identity lives on the report, not the return payload.
  const { data: reportData } = useReport(orgId, reportId);
  const report = reportData?.report;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const showSkeleton = !data && !error;

  const isCompleted = returnCase?.status === 'COMPLETED' || returnCase?.status === 'RETURNED';
  const hasExpiry = time(returnCase?.qrExpiresAt) > 0;
  const remainingMs = hasExpiry ? time(returnCase.qrExpiresAt) - now : null;
  const clock = countdown(remainingMs);
  const isExpired = isCompleted
    ? false
    : returnCase?.status === 'EXPIRED'
      || Boolean(data?.expired)
      || (hasExpiry && clock.expired);

  const isOwner = data?.isOwner !== false;
  const canRefresh = isOwner && !isCompleted && Boolean(returnCase?.id);
  const verifiedAt = returnCase?.timestamps?.verified;

  const handleRefresh = async () => {
    if (!id) return;
    setRefreshing(true);
    try {
      const result = await api.refreshQr(id);
      toast.success(result?.message || 'A new one-time QR code has been generated');
      qc.invalidateQueries({ queryKey: qk.return(orgId, id) });
      qc.invalidateQueries({ queryKey: ['returns', orgId] });
      setNow(Date.now());
    } catch (err) {
      toast.error(err?.message || 'Could not generate a new QR code');
    } finally {
      setRefreshing(false);
    }
  };

  const handleCopy = async () => {
    const reference = returnCase?.id || id;
    if (!reference) return;
    try {
      const ok = await copyText(reference);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('Return reference copied to clipboard');
      } else {
        toast.error('Copy was blocked — copy the reference manually');
      }
    } catch {
      toast.error('Copy was blocked — copy the reference manually');
    }
  };

  if (error) {
    const notFound = error?.status === 404;
    return (
      <div>
        <BackLink />
        <ErrorState
          error={error}
          title={notFound ? 'This return case no longer exists' : undefined}
          onRetry={notFound ? undefined : () => refetch()}
        />
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" onClick={() => navigate('/recovery?tab=returns')}>
            All my returns
          </Button>
          {notFound && (
            <Button onClick={() => navigate('/recovery?tab=cases')}>
              <FileText className="h-4 w-4" /> View my reports
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (showSkeleton) return <ReturnQrSkeleton />;

  if (!returnCase) {
    return (
      <div>
        <BackLink />
        <ErrorState
          title="Return case unavailable"
          error={{ message: 'We could not load the handover details for this return. Try again in a moment.' }}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="stagger">
      <BackLink />

      <PageHeader
        title={itemName(report)}
        subtitle="One-time secure pickup code"
        badge={<StatusBadge status={returnCase.status} />}
        actions={(
          <>
            <Button variant="secondary" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy return reference'}
            </Button>
            {canRefresh && (
              <Button onClick={handleRefresh} loading={refreshing}>
                <RefreshCw className="h-4 w-4" /> Refresh QR code
              </Button>
            )}
          </>
        )}
      />

      {isCompleted ? (
        /* The satisfying end of the lifecycle: an animated success state with
           a drawn checkmark, the returned item, and the handover facts. */
        <Card className="overflow-hidden text-center" padding="none">
          <div className="bg-gradient-to-b from-emerald-50/80 to-white px-6 pb-8 pt-10">
            <span className="relative mx-auto flex h-20 w-20 animate-pop-in items-center justify-center rounded-full bg-emerald-500 shadow-glow">
              <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" aria-hidden>
                <path
                  d="M5 13l4 4L19 7"
                  stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray="48" className="animate-draw-check"
                />
              </svg>
            </span>
            <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-slate-900">Item Successfully Returned</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
              {itemName(report)} was handed over to its verified owner
              {returnCase.usedAt ? ` on ${formatDateTime(returnCase.usedAt)}` : ''}. The pickup code is
              now void and cannot be used again.
            </p>
          </div>
          <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-4">
            <div className="mx-auto flex max-w-md flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm">
              <span className="text-slate-500">Item
                <span className="ml-2 font-bold text-slate-800">{itemName(report)}</span>
              </span>
              <span className="text-slate-500">Reference
                <span className="ml-2 font-mono font-semibold text-slate-700">{returnCase.id?.slice(-8).toUpperCase()}</span>
              </span>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <Card className="flex flex-col items-center gap-4">
            {isOwner ? (
              isExpired ? (
                <ExpiredPanel onRefresh={handleRefresh} loading={refreshing} expiryAt={returnCase.qrExpiresAt} />
              ) : returnCase.qrDataUrl ? (
                <>
                  <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-brand-50/60 p-3 shadow-soft">
                    <img
                      src={returnCase.qrDataUrl}
                      alt={`One-time pickup QR code for return ${returnCase.id}`}
                      className="h-64 w-64 sm:h-72 sm:w-72"
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
                      Time remaining
                    </p>
                    <p
                      className={cn(
                        'mt-1 font-mono text-3xl font-extrabold tabular-nums tracking-tight',
                        remainingMs !== null && remainingMs < 120000 ? 'text-amber-600' : 'text-slate-900'
                      )}
                    >
                      {clock.text}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {hasExpiry ? `Expires ${formatDateTime(returnCase.qrExpiresAt)}` : 'This code lapses when it is scanned'}
                    </p>
                  </div>
                </>
              ) : (
                <div className="w-full rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-6 text-center">
                  <QrCode className="mx-auto h-8 w-8 text-amber-500" />
                  <p className="mt-3 text-sm font-bold text-amber-900">The QR image could not be generated</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-amber-900/80">
                    Show the return reference below at the pickup point. Staff can look it up manually
                    if the code image is unavailable.
                  </p>
                  <p className="mt-4 rounded-xl border border-amber-200 bg-white px-3 py-2 font-mono text-sm font-bold text-slate-800">
                    {returnCase.id}
                  </p>
                  <p className="mt-3 text-xs font-semibold text-amber-900/80">
                    {returnCase.qrExpiresAt
                      ? `Expires ${formatDateTime(returnCase.qrExpiresAt)}`
                      : 'No expiry recorded for this code'}
                  </p>
                  <Button size="sm" className="mt-4" onClick={handleRefresh} loading={refreshing}>
                    <RefreshCw className="h-4 w-4" /> Refresh QR code
                  </Button>
                </div>
              )
            ) : (
              <div className="w-full rounded-2xl border border-sky-200 bg-sky-50/70 p-6 text-center">
                <Lock className="mx-auto h-8 w-8 text-sky-500" />
                <p className="mt-3 text-sm font-bold text-sky-900">Staff view</p>
                <p className="mt-1.5 text-xs leading-relaxed text-sky-900/80">
                  The one-time pickup code belongs to the verified owner and is never displayed to
                  staff. Confirm the owner in person, then scan their code to complete the handover.
                </p>
              </div>
            )}
          </Card>

          <div className="space-y-5">
            <Card>
              <div className="flex items-start gap-4">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-brand-50/50">
                  <ItemThumb report={report} className="h-full w-full" rounded="" iconClass="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-slate-900">{itemName(report)}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    {activeOrganization?.name || 'Your organization'}
                  </p>
                </div>
              </div>

              <dl className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                <Row label="Return ID" value={<span className="font-mono">{returnCase.id}</span>} />
                <Row
                  label="Pickup location"
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  value={returnCase.pickupLocation || 'To be confirmed by staff'}
                />
                <Row
                  label="Ownership"
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  value={(
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-emerald-700">Owner verified ✓</span>
                      {verifiedAt && (
                        <span className="text-[11px] font-normal text-slate-500">
                          {relativeTime(verifiedAt) || formatDateTime(verifiedAt)}
                        </span>
                      )}
                    </span>
                  )}
                />
                {returnCase.instructions && (
                  <Row label="Instructions" value={<span className="font-normal text-slate-600">{returnCase.instructions}</span>} />
                )}
                {returnCase.qrExpiresAt && (
                  <Row
                    label="Code expiry"
                    icon={<Hourglass className="h-3.5 w-3.5" />}
                    value={(
                      <span className={cn('font-semibold', isExpired ? 'text-red-600' : 'text-slate-700')}>
                        {isExpired ? 'Expired' : clock.text} · {formatDateTime(returnCase.qrExpiresAt)}
                      </span>
                    )}
                  />
                )}
              </dl>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <Button size="sm" variant="secondary" onClick={() => navigate('/recovery?tab=returns')}>
                  All returns
                </Button>
                {returnCase.reportId && (
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/my-reports/${returnCase.reportId}`)}>
                    <FileText className="h-4 w-4" /> View report
                  </Button>
                )}
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Info className="h-4 w-4" />
                </span>
                <h2 className="text-base font-bold text-slate-900">How this handover works</h2>
              </div>
              <ul className="mt-4 space-y-3">
                <Explainer
                  icon={<KeyRound className="h-4 w-4" />}
                  title="The code holds an opaque token only"
                  detail="It contains no name, email or ownership data — just a random token that the server resolves to this return."
                />
                <Explainer
                  icon={<TimerReset className="h-4 w-4" />}
                  title="It expires on the server"
                  detail={`The code is valid for ${data?.expiresInMinutes ?? 'a limited number of'} minutes. After that the server rejects it, even if the image is still on your screen.`}
                />
                <Explainer
                  icon={<ScanLine className="h-4 w-4" />}
                  title="Staff scan it to finish"
                  detail="At the pickup point, staff scan your code, confirm your identity, and that scan closes the return permanently."
                />
              </ul>
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-xs leading-relaxed text-slate-600">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>Never screenshot or forward this code. If it leaks, refresh it — refreshing invalidates the old code instantly.</span>
              </p>
            </Card>
          </div>
        </div>
      )}

      {isCompleted && returnCase.reportId && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => navigate('/recovery?tab=cases')}>
            <FileText className="h-4 w-4" /> View my reports
          </Button>
          <Button variant="secondary" onClick={() => navigate('/recovery?tab=returns')}>
            All my returns
          </Button>
        </div>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/recovery?tab=returns"
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
    >
      <ArrowLeft className="h-4 w-4" /> Back to my returns
    </Link>
  );
}

function Row({ label, value, icon }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <dt className="flex shrink-0 items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className="text-right text-sm font-semibold text-slate-700">{value}</dd>
    </div>
  );
}

function Explainer({ icon, title, detail }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{detail}</p>
      </div>
    </li>
  );
}

function ExpiredPanel({ onRefresh, loading, expiryAt }) {
  return (
    <div className="w-full rounded-2xl border border-red-200 bg-red-50/70 p-6 text-center">
      <TimerReset className="mx-auto h-8 w-8 text-red-500" />
      <p className="mt-3 text-sm font-bold text-red-900">This pickup code has expired</p>
      <p className="mt-1.5 text-xs leading-relaxed text-red-900/75">
        The server will not accept this code any more
        {expiryAt ? ` — it lapsed on ${formatDateTime(expiryAt)}` : ''}. Generate a new one and show it
        to staff at the pickup point.
      </p>
      <Button size="sm" className="mt-4" onClick={onRefresh} loading={loading}>
        <RefreshCw className="h-4 w-4" /> Generate a new QR code
      </Button>
    </div>
  );
}

function ReturnQrSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card className="flex flex-col items-center gap-4">
          <Skeleton className="h-64 w-64 sm:h-72 sm:w-72" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-40" />
        </Card>
        <div className="space-y-5">
          <Card className="space-y-3">
            <div className="flex items-center gap-4">
              <Skeleton className="h-14 w-14 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
          </Card>
          <Card className="space-y-3">
            <Skeleton className="h-5 w-48" />
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </Card>
        </div>
      </div>
    </div>
  );
}
