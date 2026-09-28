import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronRight,
  ClipboardCheck,
  Hourglass,
  Info,
  KeyRound,
  LifeBuoy,
  ListChecks,
  MessageSquare,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserCheck
} from 'lucide-react';
import api from '../lib/api';
import { useMatch } from '../lib/queries';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import ErrorState from '../components/ErrorState';
import { Modal, useToast } from '../components/Toast';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton, SkeletonCard } from '../components/ui/Skeleton';
import { cn } from '../lib/cn';
import { itemName, scoreLabel, scoreTone, statusTone } from '../lib/format';
import { ItemThumb } from '../components/ItemThumb';

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100';

/* ------------------------------------------------------------------ */
/* Local atoms                                                          */
/* ------------------------------------------------------------------ */

function ItemCard({ report, role, tone }) {
  const tones = {
    lost: 'border-amber-200 bg-amber-50/60 text-amber-800',
    found: 'border-sky-200 bg-sky-50/60 text-sky-800'
  };
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-3">
      <ItemThumb report={report} className="h-14 w-14 shrink-0" iconClass="h-5 w-5" />
      <div className="min-w-0 flex-1">
        <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold', tones[tone])}>{role}</span>
        <p className="mt-1 truncate text-sm font-bold text-slate-900">{itemName(report)}</p>
        <p className="truncate text-xs text-slate-500">
          {[report?.category, report?.location].filter(Boolean).join(' · ') || 'No location recorded'}
        </p>
      </div>
    </div>
  );
}

function AttemptDots({ attempts, max }) {
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'h-2 w-2 rounded-full transition',
            i < attempts ? 'bg-rose-400' : 'bg-slate-200'
          )}
        />
      ))}
    </span>
  );
}

function OutcomeBanner({ tone, title, children, icon: Icon }) {
  const tones = {
    success: 'border-emerald-200 bg-emerald-50/70 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50/70 text-amber-800',
    info: 'border-sky-200 bg-sky-50/70 text-sky-800'
  };
  return (
    <div className={cn('flex items-start gap-3 rounded-2xl border px-4 py-3.5', tones[tone])}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        {children && <p className="mt-1 text-xs leading-relaxed opacity-90">{children}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function VerifyOwnership() {
  const { id: matchId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { activeOrganization, activeOrganizationId } = useOrganization();

  const { data, isLoading, isFetching, isError, error, refetch } = useMatch(activeOrganizationId, matchId);

  const [verification, setVerification] = useState(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const [answer, setAnswer] = useState('');
  const [evidence, setEvidence] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceDraft, setEvidenceDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [answerError, setAnswerError] = useState(null);
  const [outcome, setOutcome] = useState(null); // { passed, message, borderline, attemptsRemaining }

  const autoStarted = useRef(false);

  const match = data?.match;
  const lost = data?.lost;
  const found = data?.found;
  const canVerify = data?.canVerify;

  const serverVerifications = data?.verifications || [];
  const alreadyVerified = useMemo(
    () => serverVerifications.find((v) => v.status === 'VERIFIED') || null,
    [serverVerifications]
  );

  const refreshAfterVerify = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['match', activeOrganizationId, matchId] });
    queryClient.invalidateQueries({ queryKey: ['dashboard', activeOrganizationId] });
    queryClient.invalidateQueries({ queryKey: ['reports', activeOrganizationId] });
    queryClient.invalidateQueries({ queryKey: ['notifications', activeOrganizationId] });
  }, [queryClient, activeOrganizationId, matchId]);

  const start = useCallback(async () => {
    if (!matchId) return;
    setStarting(true);
    setStartError(null);
    try {
      const response = await api.startVerification(matchId);
      setVerification(response?.verification || null);
      if (response?.message) toast.info(response.message);
      queryClient.invalidateQueries({ queryKey: ['match', activeOrganizationId, matchId] });
    } catch (err) {
      setStartError(err);
    } finally {
      setStarting(false);
    }
  }, [matchId, activeOrganizationId, queryClient, toast]);

  // The challenge is generated server-side; the client never authors the question.
  useEffect(() => {
    if (!activeOrganizationId || !matchId || autoStarted.current) return;
    autoStarted.current = true;
    start();
  }, [activeOrganizationId, matchId, start]);

  const submitAnswer = async (e) => {
    e.preventDefault();
    if (!verification || submitting) return;
    if (answer.trim().length < 2) {
      setAnswerError('Write at least a couple of words so staff can compare them with the original report.');
      return;
    }
    setAnswerError(null);
    setSubmitting(true);
    try {
      const response = await api.submitVerificationAnswer(verification.id, {
        answer: answer.trim(),
        evidence: evidence.trim() || undefined
      });
      const updated = response?.verification;
      if (updated) setVerification(updated);
      setOutcome({
        passed: Boolean(response?.passed),
        message: response?.message || (response?.passed ? 'Ownership verified.' : 'That answer did not match.'),
        borderline: Boolean(response?.borderline),
        attemptsRemaining: response?.attemptsRemaining ?? null
      });
      setAnswer('');
      if (response?.passed) {
        toast.success(response?.message || 'Ownership verified');
        refreshAfterVerify();
      } else {
        toast.info(response?.message || 'That answer did not match');
      }
    } catch (err) {
      setAnswerError(err?.message || 'We could not submit your answer. Please try again.');
      toast.error(err?.message || 'We could not submit your answer.');
      refreshAfterVerify();
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------- derived verification state ---------------- */

  const status = verification?.status || (alreadyVerified ? 'VERIFIED' : match?.status);
  const attempts = verification?.attempts || 0;
  const maxAttempts = verification?.maxAttempts || 3;
  const attemptsRemaining = Math.max(0, maxAttempts - attempts);
  const passed = status === 'VERIFIED' || alreadyVerified;
  // Only meaningful once a challenge actually exists — a match-level rejection is a different thing.
  const exhausted = Boolean(verification) && (status === 'REJECTED' || (status === 'PENDING' && attemptsRemaining === 0));
  const awaitingStaff = status === 'REVIEW';

  /* ---------------- loading / error ---------------- */

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Verify ownership" subtitle="Loading the match…" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Verify ownership"
          subtitle="We could not open this match."
          actions={<Button size="sm" variant="secondary" onClick={() => navigate('/matches')}><ArrowLeft className="h-4 w-4" /> All matches</Button>}
        />
        <ErrorState error={error} onRetry={refetch} title="We could not load this match" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Verify ownership" />
        <ErrorState
          variant="notfound"
          title="Match not found"
          error={{ message: 'This match no longer exists, or it belongs to another organization.' }}
          onRetry={refetch}
        />
      </div>
    );
  }

  /* ---------------- render ---------------- */

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Verify ownership"
        subtitle={match.disclaimer || 'Answer the challenge so the organization can authorise the return.'}
        badge={<StatusBadge status={match.status} tone={statusTone(match.status)} />}
        actions={(
          <>
            <Link to={`/ai-matches/${match.id}`}>
              <Button size="sm" variant="secondary"><ArrowLeft className="h-4 w-4" /> Match details</Button>
            </Link>
            <Link to="/matches">
              <Button size="sm" variant="ghost">All matches <ChevronRight className="h-4 w-4" /></Button>
            </Link>
          </>
        )}
      />

      {/* Both items, so the claimant can compare against their own memory */}
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold text-slate-900">The two reports behind this match</h2>
          <div className="flex items-center gap-2">
            <StatusBadge tone={scoreTone(match.finalScore)} label={`${Math.round(match.finalScore || 0)}% match`} dot={false} />
            <span className="text-xs text-slate-500">{scoreLabel(match.finalScore)}</span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ItemCard report={lost} role="Reported lost" tone="lost" />
          <ItemCard report={found} role="Reported found" tone="found" />
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The challenge below is generated from the original lost report. Only the person who filed that report can answer it.
        </p>
      </Card>

      <div className="mt-6 space-y-6">
        {/* ---------------- not eligible ---------------- */}
        {canVerify === false && (
          <Card padding="md">
            <OutcomeBanner tone="info" title="This challenge is not yours to answer" icon={ShieldCheck}>
              Only the member who reported the item as lost can run ownership verification. If that is you but under a different
              account, sign in with that account and try again.
            </OutcomeBanner>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to={`/ai-matches/${match.id}`}><Button size="sm" variant="secondary">Open the match</Button></Link>
              <Link to="/recovery?tab=cases"><Button size="sm" variant="ghost">My reports</Button></Link>
            </div>
          </Card>
        )}

        {/* ---------------- already verified ---------------- */}
        {canVerify !== false && passed && (
          <Card padding="md">
            <div className="flex flex-col items-center px-2 py-4 text-center">
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 18 }}
                className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600"
              >
                <BadgeCheck className="h-8 w-8" />
              </motion.div>
              <h2 className="mt-5 text-xl font-extrabold tracking-tight text-slate-900">Ownership verified</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                {outcome?.message
                  || 'Your identity was confirmed for this item. The organization can now authorise the return, and you will be notified when a pickup window opens.'}
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <StatusBadge status="VERIFIED" label="Verified" icon={UserCheck} />
                {verification?.verificationScore != null && (
                  <StatusBadge tone="default" label={`Confidence score ${verification.verificationScore}`} dot={false} />
                )}
                {match.verificationScore != null && !verification?.verificationScore && (
                  <StatusBadge tone="default" label={`Confidence score ${match.verificationScore}`} dot={false} />
                )}
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button onClick={() => navigate('/recovery?tab=returns')}>
                  <PackageCheck className="h-4 w-4" /> Track my return
                </Button>
                <Link to={`/ai-matches/${match.id}`}>
                  <Button variant="secondary">View the match</Button>
                </Link>
              </div>
            </div>
          </Card>
        )}

        {/* ---------------- awaiting staff review ---------------- */}
        {!passed && awaitingStaff && (
          <OutcomeBanner tone="info" title="Sent to staff for review" icon={Hourglass}>
            A reviewer is checking the answer you submitted. You will get a notification as soon as they decide — there is
            nothing else to do here.
          </OutcomeBanner>
        )}

        {/* ---------------- no attempts left ---------------- */}
        {!passed && !awaitingStaff && exhausted && (
          <Card padding="md">
            <div className="flex flex-col items-center px-2 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-50 text-amber-600">
                <LifeBuoy className="h-8 w-8" />
              </div>
              <h2 className="mt-5 text-lg font-extrabold text-slate-900">No verification attempts remaining</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                The three attempts for this challenge are used up, so it can no longer be answered online. Contact the
                {activeOrganization?.name ? ` ${activeOrganization.name}` : ''} lost &amp; found desk in person — they can
                verify you manually and authorise the return.
              </p>
              {verification?.reviewNotes && (
                <p className="mt-4 max-w-md rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  <span className="font-bold text-slate-700">Staff note: </span>{verification.reviewNotes}
                </p>
              )}
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Link to="/notifications"><Button variant="secondary"><MessageSquare className="h-4 w-4" /> Check updates</Button></Link>
                <Link to="/recovery?tab=cases"><Button variant="ghost">My reports</Button></Link>
              </div>
            </div>
          </Card>
        )}

        {/* ---------------- challenge ---------------- */}
        {canVerify !== false && !passed && !exhausted && (
          <Card padding="md">
            {starting && !verification ? (
              <div className="space-y-4">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-32 w-full rounded-2xl" />
                <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse" /> Generating a challenge from your original report…
                </p>
              </div>
            ) : startError && !verification ? (
              <ErrorState
                error={startError}
                onRetry={start}
                title={startError.status === 400 ? 'This match is not eligible for verification' : 'We could not start the challenge'}
              />
            ) : !verification ? (
              <div className="flex flex-col items-center px-2 py-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <KeyRound className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-base font-bold text-slate-900">Ownership verification</h2>
                <p className="mt-1.5 max-w-sm text-sm text-slate-500">
                  We will build a challenge from the details in your original lost report — a question only the owner can answer.
                </p>
                <Button className="mt-5" onClick={start} loading={starting}>Start ownership verification</Button>
              </div>
            ) : (
              <form onSubmit={submitAnswer} className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                    <ClipboardCheck className="h-4 w-4 text-brand-600" /> Ownership challenge
                  </h2>
                  <div className="flex items-center gap-2">
                    <AttemptDots attempts={attempts} max={maxAttempts} />
                    <span className="text-xs font-bold text-slate-500">
                      Attempt {Math.min(attempts + 1, maxAttempts)} of {maxAttempts}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border-2 border-brand-200 bg-brand-50/50 p-5">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">Question</p>
                  <p className="mt-2 text-base font-bold leading-snug text-slate-900">
                    {verification.question || 'Answer from the details in your original report.'}
                  </p>
                  {verification.hint && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-brand-800">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Hint: {verification.hint}
                    </p>
                  )}
                </div>

                {outcome && !outcome.passed && (
                  <OutcomeBanner tone="warning" title="That answer was not accepted" icon={TriangleAlert}>
                    {outcome.message}
                    {typeof outcome.attemptsRemaining === 'number' && outcome.attemptsRemaining > 0 && (
                      <> {outcome.attemptsRemaining} attempt{outcome.attemptsRemaining === 1 ? '' : 's'} left — answer using the exact wording from your original report.</>
                    )}
                  </OutcomeBanner>
                )}

                <div>
                  <label htmlFor="answer" className="mb-1.5 block text-xs font-bold text-slate-600">
                    Your answer <span className="ml-0.5 text-rose-500">*</span>
                  </label>
                  <textarea
                    id="answer"
                    rows={4}
                    value={answer}
                    onChange={(e) => { setAnswer(e.target.value); setAnswerError(null); }}
                    placeholder="Answer in your own words, but include the exact detail from your report."
                    className={cn(inputCls, 'resize-y', answerError && 'border-rose-300 focus:border-rose-400 focus:ring-rose-100')}
                  />
                  {answerError ? (
                    <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-rose-600">
                      <TriangleAlert className="h-3 w-3 shrink-0" /> {answerError}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-slate-400">
                      Answers are graded against your original report by the server — the expected answer is never sent to your browser.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => { setEvidenceDraft(evidence); setEvidenceOpen(true); }}
                  >
                    <ListChecks className="h-3.5 w-3.5" />
                    {evidence.trim() ? 'Edit supporting evidence' : 'Add supporting evidence'}
                  </Button>
                  {evidence.trim() && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <Check className="h-3.5 w-3.5" /> Evidence attached to this answer
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-400">Signed in as {user?.name}</p>
                  <Button type="submit" loading={submitting} disabled={answer.trim().length < 2}>
                    <ShieldCheck className="h-4 w-4" />
                    {submitting ? 'Checking your answer…' : 'Submit answer'}
                  </Button>
                </div>
              </form>
            )}
          </Card>
        )}

        {/* ---------------- support ---------------- */}
        <Card padding="md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <LifeBuoy className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">Stuck on the challenge?</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Re-read the details on your original report, or hand the item to the lost &amp; found desk with proof of purchase.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {lost?.id && <Link to={`/my-reports/${lost.id}`}><Button size="sm" variant="ghost">My report</Button></Link>}
              {isFetching && <span className="self-center text-xs font-semibold text-slate-400">Refreshing…</span>}
            </div>
          </div>
        </Card>
      </div>

      {/* ---------------- evidence modal ---------------- */}
      <Modal
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        title="Supporting evidence"
        description="Optional. A purchase date, an order id, or anything else that helps staff confirm you are the owner."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setEvidenceOpen(false)}>Cancel</Button>
            <Button
              onClick={() => { setEvidence(evidenceDraft.trim()); setEvidenceOpen(false); }}
            >
              <Check className="h-4 w-4" /> Save evidence
            </Button>
          </>
        )}
      >
        <textarea
          rows={5}
          value={evidenceDraft}
          onChange={(e) => setEvidenceDraft(e.target.value)}
          placeholder="e.g. Bought on 12 Aug from the campus store, order #4417, receipt in my email."
          className={cn(inputCls, 'resize-y')}
        />
        <p className="mt-2 text-xs text-slate-400">Stored on the verification record and visible to organization staff only.</p>
      </Modal>
    </div>
  );
}
