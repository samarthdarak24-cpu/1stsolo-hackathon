# Attribution

Ideas and patterns adapted from third-party repositories while building LostLink AI.
The full research — every candidate checked for license **before** cloning — is in
`docs/github-repos-by-feature.md`. The clones themselves live in `reference/`:
gitignored reading material, never shipped.

No files were vendored into this repository. What follows is pattern-level
adaptation: a rule or behaviour was studied in the reference repo and then
reimplemented in this codebase's own style, with the source named at the point
of change.

## Adapted patterns

### [oluwakayodemike/ReuniteAI](https://github.com/oluwakayodemike/ReuniteAI) — MIT

- **Ownership verification falls back to manual review.** ReuniteAI routes any
  claim its automated check cannot certify to a human ("unclear decision,
  defaulting to manual review"; "failing back to manual review"). Adopted in
  `mern/backend/src/services/verificationService.js`: when a claimant exhausts
  the attempt budget, the verification escalates to `REVIEW` — the claimant is
  notified, every `verification:review` member (staff/admin/owner) is notified,
  and the audit trail records `VERIFICATION_ESCALATED` — instead of dead-ending
  at `REJECTED`. `startVerification` no longer mints a fresh challenge over a
  `REVIEW`/`REJECTED` verdict.
- Also read for: image normalization before embedding — already covered in this
  repo by `mern/ai-service/app/core/preprocess.py` (EXIF transpose, RGB convert,
  pixel-limit guard).

### [stoneset/tagd](https://github.com/stoneset/tagd) — MIT

- **Scan logs + owner alerts.** tagd records every tag scan (timestamp, source)
  and notifies the owner the moment it happens, with a rate-limited scan route.
  Adopted in `mern/backend/src/services/returnService.js`: every failed QR scan
  attempt writes a `QR_SCAN_FAILED` audit row, and the actionable or suspicious
  reasons (expired code, wrong handover code, mismatched QR token) also notify
  the item owner via a `SYSTEM` notification. `POST /returns/:id/scan-qr` in
  `mern/backend/src/routes/api.js` now carries `apiLimiter`.

### [MatthewWid/better-sse](https://github.com/MatthewWid/better-sse) — MIT

- **`Last-Event-ID` resume + backpressure.** better-sse reads the resume cursor
  from either the `Last-Event-ID` header or a `?lastEventId=` query parameter,
  and copes with consumers that stop reading. Adopted in
  `mern/backend/src/realtime/events.js`: every SSE frame carries an increasing
  `id:` line, a bounded 200-event ring backs replay of whatever a reconnecting
  client missed (same visibility rules as live delivery), and a client whose
  socket buffer passes 512 KB is disconnected instead of buffering the org's
  stream in memory. `mern/frontend/src/lib/useLiveEvents.js` tracks the last
  received id and re-sends it on every reconnect.

## Studied, deliberately not copied

- **davidamacey/OpenProcessor** — AGPL-3.0. Its docs were read online only; no
  source was vendored, because AGPL code would impose its terms on this whole
  application.
- Everything marked "Reference only" in `docs/github-repos-by-feature.md`
  (no license file): architecture read, zero files copied. Public ≠ public
  domain.

