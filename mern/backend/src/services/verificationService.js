/**
 * Verification service — server-generated ownership challenges.
 *
 * The challenge is always derived from the stored lost report. The client can
 * never choose the question or the expected answer, which closes the hole where
 * a claimant previously supplied their own answer.
 */
const { getDriver } = require('../store');
const { AppError } = require('../utils/errors');
const { audit } = require('./auditService');
const notifications = require('./notificationService');
const realtime = require('../realtime/events');
const reports = require('./reportService');
const { requireActiveOrg } = require('./orgContext');

const MAX_ATTEMPTS = 3;
const PASS_SCORE = 75;
const PARTIAL_SCORE = 40;

const CHALLENGE_BUILDERS = [
  {
    key: 'visibleMark',
    build: (report) => (report.itemProfile?.visibleMark
      ? {
        question: 'Describe the mark, logo or sticker visible on the item.',
        hint: 'You gave this detail when reporting the item.',
        answer: report.itemProfile.visibleMark
      }
      : null)
  },
  {
    key: 'contents',
    build: (report) => (report.itemProfile?.finderNotes || report.itemProfile?.itemName
      ? {
        question: 'What was inside the item, or what was it used for?',
        hint: 'Use details only the owner would know.',
        answer: report.itemProfile.finderNotes || report.itemProfile.itemName
      }
      : null)
  },
  {
    key: 'location',
    build: (report) => (report.lastSeen?.landmark || report.location
      ? {
        question: 'Where exactly was the item last seen?',
        hint: 'Name the room, floor or landmark.',
        answer: report.lastSeen?.landmark || report.location
      }
      : null)
  },
  {
    key: 'brand',
    build: (report) => (report.itemProfile?.brand
      ? {
        question: 'Which brand was printed on the item?',
        hint: 'Check the original report for the recorded brand.',
        answer: report.itemProfile.brand
      }
      : null)
  }
];

const normalise = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Similarity of a free-text answer to the expected evidence. */
function gradeAnswer(answer, expected) {
  const a = normalise(answer);
  const e = normalise(expected);
  if (!a || !e) return 0;
  if (a === e) return 100;
  if (a.includes(e) || e.includes(a)) return 90;

  const at = new Set(a.split(' ').filter(t => t.length > 2));
  const et = new Set(e.split(' ').filter(t => t.length > 2));
  if (!at.size || !et.size) return 0;
  let shared = 0;
  at.forEach(t => { if (et.has(t)) shared += 1; });
  const overlapScore = Math.round((shared / Math.max(at.size, et.size)) * 100);
  const charScore = a.includes(e.slice(0, Math.max(3, Math.floor(e.length / 2)))) ? 40 : 0;
  return Math.max(overlapScore, charScore);
}

function buildChallenge(report) {
  const builders = [...CHALLENGE_BUILDERS].sort(() => 0.5 - Math.random());
  for (const builder of builders) {
    const challenge = builder.build(report);
    if (challenge) {
      return {
        key: builder.key,
        question: challenge.question,
        hint: challenge.hint,
        expected: challenge.answer,
        generatedAt: new Date(),
        reportReference: report.reference || report.id
      };
    }
  }
  return {
    key: 'description',
    question: 'Describe the item and where you last saw it.',
    hint: 'Add as much detail as you can remember.',
    expected: report.description,
    generatedAt: new Date(),
    reportReference: report.reference || report.id
  };
}

/** Strips the expected answer before the challenge leaves the server. */
const publicChallenge = (verification) => ({
  id: verification.id,
  matchId: verification.matchId,
  reportId: verification.reportId,
  question: verification.challenge?.question,
  hint: verification.challenge?.hint,
  status: verification.status,
  attempts: verification.attempts || 0,
  maxAttempts: MAX_ATTEMPTS,
  verificationScore: verification.verificationScore,
  createdAt: verification.createdAt,
  answeredAt: verification.claimantAnswer ? verification.updatedAt : null,
  reviewNotes: verification.reviewNotes || null
});

/** Roles that hold the `verification:review` permission (see orgContext). */
const REVIEWER_ROLES = ['staff', 'admin', 'owner'];

/**
 * Pings every review-capable member of the org (bar the claimant) when a
 * claim escalates, so the escalation lands in a human queue rather than only
 * in a database row. Notification failures are logged and never roll back
 * the escalation itself.
 */
async function notifyReviewers(orgId, excludeUserId, verificationId, lost) {
  try {
    const store = getDriver();
    const members = await store.listMembers(orgId);
    const reviewers = members.filter((m) => m.id !== excludeUserId && REVIEWER_ROLES.includes(m.role));
    await Promise.all(reviewers.map((m) => notifications.notify(m.id, orgId, {
      type: notifications.TYPE.VERIFICATION_RESULT,
      title: 'Ownership check needs manual review',
      message: `The claim on ${lost?.itemProfile?.itemName || 'a reported item'} used all ${MAX_ATTEMPTS} automatic attempts. Open the verifications screen to review the answer and evidence.`,
      referenceId: verificationId,
      referenceType: 'VERIFICATION'
    })));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[verification] reviewer notifications failed:', err.message);
  }
}

async function startVerification(req, matchId) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);

  const match = await store.findMatchById(matchId);
  if (!match || match.organizationId !== ctx.orgId) throw AppError.notFound('Match not found');

  const lost = await store.findReportById(match.lostReportId);
  if (!lost) throw AppError.notFound('The lost report behind this match is unavailable');

  if (lost.userId !== req.user.id) {
    throw AppError.forbidden('Only the owner of the lost report can start ownership verification');
  }
  if (!['PENDING_VERIFICATION', 'MANUAL_REVIEW', 'PENDING', 'VERIFICATION_PENDING'].includes(match.status)) {
    throw AppError.badRequest('This match is not eligible for verification');
  }

  const existing = (await store.listVerifications(ctx.orgId, { matchId }))[0];
  if (existing && existing.status === 'PENDING') {
    return { verification: publicChallenge(existing), message: 'Verification already in progress' };
  }
  if (existing && existing.status === 'VERIFIED') {
    return { verification: publicChallenge(existing), message: 'This match is already verified' };
  }
  // An escalated claim (all attempts used) and a staff rejection are terminal
  // states with a human decision behind them. Minting a fresh challenge here
  // would let a claimant restart after staff said no — return what exists.
  if (existing && existing.status === 'REVIEW') {
    return {
      verification: publicChallenge(existing),
      message: 'Your answers are with organization staff for manual review'
    };
  }
  if (existing && existing.status === 'REJECTED') {
    return {
      verification: publicChallenge(existing),
      message: 'Staff rejected this verification. Contact the organization to discuss your claim.'
    };
  }

  const challenge = buildChallenge(lost);
  const saved = await store.createVerification({
    organizationId: ctx.orgId,
    matchId,
    reportId: lost.id,
    claimantUserId: req.user.id,
    challenge,
    expectedEvidence: { expected: challenge.expected, key: challenge.key },
    status: 'PENDING',
    attempts: 0
  });

  await store.updateMatch(matchId, { status: 'VERIFICATION_PENDING' });
  await reports.transition(store, lost, 'VERIFICATION_PENDING', { userId: req.user.id, note: 'Ownership verification started' });
  // The reviewer queue and the claimant's own page both watch this stream.
  realtime.publish(ctx.orgId, {
    type: 'VERIFICATION_UPDATE',
    payload: { action: 'started', verificationId: saved.id, matchId, reportId: lost.id }
  });

  await audit(req, {
    organizationId: ctx.orgId,
    action: 'VERIFICATION_CREATED',
    entityType: 'VERIFICATION',
    entityId: saved.id,
    metadata: { matchId, reportId: lost.id, challengeKey: challenge.key }
  });

  return { verification: publicChallenge(saved), message: 'Verification challenge created' };
}

async function submitAnswer(req, verificationId, body) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);

  const verification = await store.findVerificationById(verificationId);
  if (!verification || verification.organizationId !== ctx.orgId) throw AppError.notFound('Verification not found');
  if (verification.claimantUserId !== req.user.id) throw AppError.forbidden('This verification belongs to another user');
  if (verification.status !== 'PENDING') throw AppError.badRequest('This verification is no longer pending');

  const attempts = (verification.attempts || 0) + 1;
  if (attempts > MAX_ATTEMPTS) throw AppError.badRequest('No verification attempts remaining. Contact organization staff.');

  const answer = String(body.answer || '').trim();
  if (answer.length < 2) throw AppError.badRequest('Please provide an answer');

  const score = gradeAnswer(answer, verification.expectedEvidence?.expected);
  const passed = score >= PASS_SCORE;
  const borderline = !passed && score >= PARTIAL_SCORE;
  // A wrong or borderline answer stays retryable until the attempt budget runs
  // out — and when the budget runs out the claim is NOT dead-ended: it falls
  // back to human review. Rule studied from ReuniteAI (MIT): any outcome the
  // automated check cannot certify goes to a manual reviewer, never to a wall
  // (their exact wording: "unclear decision, defaulting to manual review").
  const status = passed ? 'VERIFIED' : (attempts < MAX_ATTEMPTS ? 'PENDING' : 'REVIEW');
  const escalated = !passed && status === 'REVIEW';

  const updated = await store.updateVerification(verificationId, {
    claimantAnswer: answer,
    evidence: body.evidence || null,
    attempts,
    verificationScore: score,
    status,
    reviewedAt: passed ? new Date() : null
  });

  const lost = await store.findReportById(verification.reportId);

  if (passed) {
    const match = await store.findMatchById(verification.matchId);
    if (lost) await reports.transition(store, lost, 'VERIFIED', { userId: req.user.id, note: `Ownership verified (score ${score})` });
    if (match) await store.updateMatch(verification.matchId, { status: 'VERIFIED', reviewedAt: new Date() });

    await notifications.notify(req.user.id, ctx.orgId, {
      type: notifications.TYPE.VERIFICATION_RESULT,
      title: 'Ownership verified',
      message: `Your identity was verified for ${lost?.itemProfile?.itemName || 'your item'}. The organization can now authorise the return.`,
      referenceId: verificationId,
      referenceType: 'VERIFICATION'
    });
  } else if (escalated) {
    // The claimant learns the automated check is over and a human has it now;
    // every review-capable member (staff/admin/owner — the `verification:review`
    // roles) gets pinged so the escalation reaches a person, not just a row.
    await notifications.notify(req.user.id, ctx.orgId, {
      type: notifications.TYPE.VERIFICATION_RESULT,
      title: 'Sent for manual review',
      message: `Your answers for ${lost?.itemProfile?.itemName || 'your item'} could not be confirmed automatically, so organization staff will review them by hand. You will hear back after the review.`,
      referenceId: verificationId,
      referenceType: 'VERIFICATION'
    });
    await notifyReviewers(ctx.orgId, req.user.id, verificationId, lost);
  }

  await audit(req, {
    organizationId: ctx.orgId,
    action: escalated ? 'VERIFICATION_ESCALATED' : passed ? 'VERIFICATION_PASSED' : 'VERIFICATION_SUBMITTED',
    entityType: 'VERIFICATION',
    entityId: verificationId,
    metadata: { score, attempts, status }
  });
  realtime.publish(ctx.orgId, {
    type: 'VERIFICATION_UPDATE',
    payload: { action: 'answered', verificationId, matchId: verification.matchId, status }
  });

  return {
    verification: publicChallenge(updated),
    passed,
    borderline,
    attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attempts),
    message: passed
      ? 'Ownership verified. The organization can now authorise your return.'
      : escalated
        ? `All ${MAX_ATTEMPTS} attempts used — your answers were sent to organization staff for manual review.`
        : borderline
          ? 'Partially correct — recorded for review. Add more detail and try again.'
          : 'That answer did not match. Please try again.'
  };
}

async function reviewVerification(req, verificationId, body) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  const { assertPermission } = require('./orgContext');
  assertPermission(ctx, 'verification:review');

  const verification = await store.findVerificationById(verificationId);
  if (!verification || verification.organizationId !== ctx.orgId) throw AppError.notFound('Verification not found');

  const action = String(body.action || '');
  if (!['approve', 'reject', 'request-more'].includes(action)) throw AppError.badRequest('Invalid action');

  const status = action === 'approve' ? 'VERIFIED' : action === 'reject' ? 'REJECTED' : 'REVIEW';
  const updated = await store.updateVerification(verificationId, {
    status,
    reviewedBy: req.user.id,
    reviewedAt: new Date(),
    reviewNotes: body.notes || null
  });

  const lost = await store.findReportById(verification.reportId);
  if (lost && action === 'approve') {
    await reports.transition(store, lost, 'VERIFIED', { userId: req.user.id, note: `Approved by staff${body.notes ? `: ${body.notes}` : ''}` });
    const match = await store.findMatchById(verification.matchId);
    if (match) await store.updateMatch(verification.matchId, { status: 'VERIFIED', reviewedAt: new Date() });
  }

  await notifications.notify(verification.claimantUserId, ctx.orgId, {
    type: notifications.TYPE.VERIFICATION_RESULT,
    title: action === 'approve' ? 'Ownership verified' : action === 'reject' ? 'Verification rejected' : 'Verification needs review',
    message: body.notes || `Your ownership verification was ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'sent for review'}.`,
    referenceId: verificationId,
    referenceType: 'VERIFICATION'
  });

  await audit(req, {
    organizationId: ctx.orgId,
    action: action === 'approve' ? 'VERIFICATION_APPROVED' : 'VERIFICATION_REJECTED',
    entityType: 'VERIFICATION',
    entityId: verificationId,
    metadata: { action, notes: body.notes || null }
  });
  realtime.publish(ctx.orgId, {
    type: 'VERIFICATION_UPDATE',
    payload: { action: 'reviewed', verificationId, matchId: verification.matchId, status }
  });

  return { verification: updated, message: `Verification ${action}` };
}

async function listVerifications(req, query) {
  const store = getDriver();
  const ctx = await requireActiveOrg(req);
  const canReview = ['staff', 'security', 'admin', 'owner'].includes(ctx.role);

  const filters = {};
  if (query.status) filters.status = query.status;
  if (query.matchId) filters.matchId = query.matchId;
  if (query.reportId) filters.reportId = query.reportId;
  if (!canReview) filters.claimantUserId = req.user.id;

  const rows = await store.listVerifications(ctx.orgId, filters);
  // Both audiences get the SAME public shape. Reviewers are staff, not the
  // claimant, so they get the question and the hint but never `expected` — a
  // reviewer who could read the answer would rubber-stamp every check. Returning
  // raw rows here used to hand back `challenge.expected` to anyone with the
  // review role and left `question` unflattened, so the review screen rendered
  // an empty question.
  return {
    verifications: rows.map(publicChallenge),
    total: rows.length
  };
}

module.exports = { startVerification, submitAnswer, reviewVerification, listVerifications, publicChallenge, gradeAnswer, buildChallenge };
