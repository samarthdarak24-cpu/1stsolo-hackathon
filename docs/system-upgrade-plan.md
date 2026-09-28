# LostLink AI — System Status & Roadmap

Authoritative inventory: **what is implemented** (with file paths and evidence) and
**what still needs to be added** (with acceptance checks, so "done" is testable).

Status key: `[x]` implemented and verified · `[~]` code written, verification pending ·
`[ ]` not started · `[!]` broken / blocking.

Last updated: 2026-09-28.

---

## 1. System shape

| Layer | Tech | Port | Entry point |
| --- | --- | --- | --- |
| Frontend | React 18 + Vite 5 + Tailwind + Radix + TanStack Query + recharts | 5173 | `mern/frontend/src/main.jsx` → `App.jsx` |
| Backend API | Node + Express 4, Mongoose, JWT, Zod, multer, Helmet, rate-limit | 5000 | `mern/backend/src/index.js` |
| AI service | Python 3.11 + FastAPI + torch 2.14 (CPU) + transformers 5.17 + ultralytics | 8100 | `mern/ai-service/app/main.py` |
| Database | MongoDB | 27017 | `mern/backend/src/store/mongoDriver.js` |
| Queue | in-process (journalled to disk); BullMQ + Redis if `REDIS_URL` set | — | `mern/backend/src/services/aiQueue.js` |
| Vector store | Qdrant ladder: server → local on-disk → in-memory | — | `mern/ai-service/app/vector/store.py` |
| Realtime | SSE bus, org + user scoped | 5000 | `mern/backend/src/realtime/events.js` |

Dev wiring: Vite proxies **both** `/api` and `/uploads` to `:5000`
(`mern/frontend/vite.config.js`), so the browser stays same-origin and uploaded
photos resolve. Routing is **HashRouter** — deep links look like
`http://localhost:5173/#/login`.

Data model (Mongoose, `mern/backend/src/models/index.js`): User, Organization,
Report, Match, Verification, ReturnAuthorization/Return, CustodyRecord, AuditLog,
Notification.

---

## 2. What is implemented

### 2.1 User dashboard — 9/9

| # | Feature | Route | Page | Key API |
| --- | --- | --- | --- | --- |
| 1 | Dashboard | `/dashboard` | `UserDashboard.jsx` | `GET /api/dashboard`, `/api/dashboard/unread` |
| 2 | Report Lost | `/report-lost` | `ReportLost.jsx` | `POST /api/ai/analyze-item`, `POST /api/reports/lost` |
| 3 | Report Found | `/report-found` | `ReportFound.jsx` | `POST /api/ai/analyze-item`, `POST /api/reports/found` |
| 4 | AI Matches | `/ai-matches`, `/ai-matches/:id`, `/ai-matches/:id/verify` | `AIMatches.jsx`, `MatchDetail.jsx`, `VerifyOwnership.jsx` | `GET /api/matches`, `GET /api/matches/:id`, `POST /api/verifications` |
| 5 | My Reports | `/my-reports`, `/my-reports/:id` | `MyReports.jsx`, `ReportDetail.jsx` | `GET /api/reports`, `/api/reports/:id/timeline` |
| 6 | Notifications | `/notifications` | `Notifications.jsx` | `GET /api/notifications`, `/summary`, `PATCH /:id/read`, SSE `/api/events` |
| 7 | Track Return | `/track-return`, `/track-return/:id/qr` | `TrackReturn.jsx`, `ReturnQr.jsx` | `GET /api/returns`, `/returns/:id/qr`, `/refresh-qr` |
| 8 | Profile | `/profile` | `Profile.jsx` | `GET/PATCH /api/profile` |
| 9 | Settings | `/settings` | `Settings.jsx` | `POST /api/profile/password` |

### 2.2 Organization dashboard — 11/11

| # | Feature | Route | Page | Key API |
| --- | --- | --- | --- | --- |
| 1 | Overview | `/organization/dashboard` | `OrgDashboard.jsx` | `GET /api/dashboard`, `/api/analytics/organization` |
| 2 | Lost & Found | `/organization/lost-found` | `OrgLostFound.jsx` | `GET /api/reports`, `PATCH /api/reports/:id` |
| 3 | AI Matching | `/organization/ai-matching`, `/:id` | `OrgAIMatching.jsx`, `OrgMatchDetail.jsx` | `GET /api/matches`, `POST /api/matches/:id/review`, `POST /api/reports/:id/rematch` |
| 4 | Verification | `/organization/verification`, `/:id` | `OrgVerification.jsx` | `GET /api/verifications`, `POST /api/verifications/:id/review` |
| 5 | Items | `/organization/items` | `OrgItems.jsx` | `GET /api/custody`, `PATCH /api/reports/:id` |
| 6 | CCTV / Last Seen | `/organization/cctv` | `OrgCCTV.jsx` | `GET /api/cctv/status`, `/cctv/events/:reportId`, `POST /api/cctv/analyze` |
| 7 | Chain of Custody | `/organization/chain-of-custody` | `OrgChainOfCustody.jsx` | `GET /api/custody`, `/api/reports/:id/custody` |
| 8 | Users & Staff | `/organization/users` | `OrgUsers.jsx` | `GET /api/organizations/:id/users`, `PATCH .../users/:userId`, `POST .../invite` |
| 9 | Analytics | `/organization/analytics` | `OrgAnalytics.jsx` | `GET /api/analytics/organization` |
| 10 | Audit Logs | `/organization/audit-logs` | `OrgAuditLogs.jsx` | `GET /api/audit-logs`, `/api/audit-log-types` |
| 11 | Organization Settings | `/organization/settings` | `OrgSettings.jsx` | `GET/PATCH /api/organizations/:id/settings` |

Role gating (frontend `RequireAuth`, backend `routes/api.js`) is aligned:

| Guard | Roles | Surfaces |
| --- | --- | --- |
| user (any authenticated) | member, staff, security, admin, owner | dashboard, reports, matches, returns, profile, settings |
| `orgOnly` | staff, security, admin, owner | overview, lost & found, AI matching, verification, items, CCTV, chain of custody |
| `adminOnly` / API `MANAGERS` | admin, owner | analytics, audit logs, users, org settings |
| API `STAFF` | staff, security, admin, owner | match review, custody writes, return authorization, QR scan |

### 2.3 Lifecycle backbone

```
Report → AI Understand → Match → Notify → Verify → Manage → Handover → Return → Audit/Analytics
```

Every hop has a live endpoint: `POST /reports/lost|found` → `POST /ai/analyze-item`
→ `match:report` job → `GET /matches` + `POST /matches/:id/review` →
`POST /verifications` → `POST /verifications/:id/answer` → `POST /verifications/:id/review`
→ `POST /returns/:reportId/create` → `GET /returns/:id/qr` → `POST /returns/:id/scan-qr`
→ `POST /reports/:id/custody` → `GET /audit-logs`, `GET /analytics/organization`.

### 2.4 AI service

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | live capability: per-provider state, device, vector tier |
| `GET /providers`, `POST /warmup` | introspection and forced preload |
| `POST /embed/text`, `POST /embed/image` | BGE-M3 and SigLIP embeddings |
| `POST /analyze-item` | detection + OCR + colour + profile (image → attributes) |
| `POST /match` | retrieve → fuse → explain candidate matches |
| `POST /rerank` | BGE reranker over candidate pairs |
| `POST /explain` | natural-language rationale |
| `POST /cctv/analyze` | footage → tracked item events (no face recognition) |

Providers are lazy per-model with honest `unavailable` reporting; the pipeline
degrades signal by signal instead of failing the request.

### 2.5 Fixed in this session

| # | Problem | Fix | Files | Evidence |
| --- | --- | --- | --- | --- |
| F1 | Item photos 404'd; every list showed a placeholder icon | Proxy `/uploads` to the backend | `mern/frontend/vite.config.js` | `GET :5173/uploads/items/black-backpack.svg` → `image/svg+xml` (was `text/html`) |
| F2 | `localhost` unreachable in some browsers (Vite bound IPv6 only) | `host: true` | `mern/frontend/vite.config.js` | `localhost:5173` and `127.0.0.1:5173` both 200 |
| F3 | Backend bound port 0 (machine-wide `PORT=0`) | Force `PORT=5000` in the launcher | `mern/backend/start-server.cmd` | boot log `API on http://localhost:5000` |
| F4 | Staff/security were sent to the student dashboard | `dashboardTypeFor` now uses the backend `STAFF` role group | `mern/backend/src/services/authService.js` | login `staff@abcschool.com` → `dashboardType: "org"` |
| F5 | Staff could not open the queues they own (whole portal was `adminOnly`) | New `orgOnly` guard; admin surfaces keep `adminOnly` | `mern/frontend/src/App.jsx`, `context/AuthContext.jsx` | routes verified in source; UI check pending (T3) |
| F6 | First item scan paid the cold-load cost (tens of seconds) | `WARMUP_ON_BOOT` preloads in a daemon thread; `/health` stays fast | `ai-service/app/core/config.py`, `app/main.py`, `start-server.cmd`, `.env.example` | warmup 46.9s in background: `detector` 1.17s, `siglip` 34.79s, `bge_m3` 7.76s, `ocr` ready |
| F7 | Embeddings were lost on every restart | Vector ladder: server → **local on-disk** → in-memory; `/health` no longer flags durability | `ai-service/app/vector/store.py`, `routers/health.py`, `core/config.py` | `vector_store: "qdrant-local"`, `status: "ok"` |
| F8 | A restart dropped queued match jobs (reports stuck at `MATCHING`) | In-process queue journals unfinished jobs (atomic tmp+rename) and replays on boot | `mern/backend/src/services/aiQueue.js`, `src/config/index.js` | round-trip test pending (T2) |
| F9 | qdrant-client teardown raised on interpreter shutdown | Explicit `VectorStore.close()` | `ai-service/app/vector/store.py` | write/read test no longer raises from `__del__` |

Operator convenience added: `start-mern.cmd` (root) plus `start-server.cmd` in each
sub-project; logs land in `*.out.log`.

---

## 3. Verification evidence

| Check | Command | Observed |
| --- | --- | --- |
| Services up | `netstat -ano \| grep LISTENING` | 5173, 5000, 8100 listening |
| AI capability | `curl :8100/health` | `status: "ok"`, 4 providers `ready`, 2 `lazy` (reranker, vlm), `vector_store: "qdrant-local"` |
| Warm-up | `tail mern/ai-service/ai-service.out.log` | `warmup finished in 46.9s - ready=['detector','siglip','ocr','bge_m3']` |
| Uploads render | `curl -I :5173/uploads/items/black-backpack.svg` | `200`, `content-type: image/svg+xml` |
| Staff routing (API) | `POST /api/auth/login` as staff | `dashboardType: "org"` |
| Vector write persists | `python -m tests.vector_durability write` | `store mode: qdrant-local`, wrote probe points |
| Vector read-back | `python -m tests.vector_durability read` | `PASS: embeddings survive a restart and the tenant filter still holds.` |
| Qdrant client API | `hasattr(QdrantClient, ...)` on 1.19.1 | `query_points` True, `search` **False**, `collection_exists`/`delete`/`upsert` True |

---

## 4. What needs to be added

### P0 — blocking correctness

> The one blocking defect (P0-A) is fixed and verified. T2–T5 are the next pass.

- `[x]` **P0-A. Qdrant search was broken on the installed client (found by T1, fixed).**
  `qdrant-client 1.19.1` **removed `client.search()`** — it now exposes
  `query_points()` (and `search_batch()` is gone too). `store.py` still calls
  `.search()`, so **every** search raises, silently falls back to the in-memory
  index, and returns **zero candidates**. Matching therefore finds nothing in
  `qdrant` *and* `qdrant-local` modes.
  *Evidence:* `qdrant search failed, falling back: 'QdrantClient' object has no
  attribute 'search'` → `found for 'durability-test': []` although the probe was
  written and persisted.
  *Fix applied:* new `VectorStore._query()` calls `query_points(query=..., query_filter=...,
  limit=...)` and reads `result.points`, detecting the method with `hasattr`
  rather than catching AttributeError, so a future removal cannot masquerade as
  "no candidates" again. The local engine also skips `create_payload_index`
  (no indexes there, it only warned).
  *Verified:* `collection_exists`, `delete`, `upsert`, `get_collections` all still
  exist in 1.19; durability test now prints `PASS`.
  *Still to check:* `POST /match` against seeded data (see T4 — the existing index
  is empty, so this needs the reindex first).

- `[x]` **T1. Vector durability across processes.** Test at
  `ai-service/tests/vector_durability.py` — `write` then `read` in separate
  interpreters, asserts the probe survives *and* that a second tenant cannot see
  it. *Result:* `PASS: embeddings survive a restart and the tenant filter still
  holds.`

- `[ ]` **T2. Queue journal replay.** Enqueue `match:report`, kill the backend
  before drain, boot again. *Done when:* the log shows `restored N unfinished
  job(s)` and the report leaves `MATCHING` with no manual rematch.

- `[ ]` **T3. Staff routing in the browser.** `staff@abcschool.com` lands on
  `/organization/dashboard`; admin-only pages bounce back to it; `student@` still
  lands on `/dashboard`. *Done when:* all four observed in the running UI.

- `[ ]` **T4. Reindex existing reports.** Embeddings written before the durable
  tier existed are gone, so the index holds fewer candidates than Mongo.
  *Add:* idempotent rebuild (read reports → re-embed image/text → upsert payload).
  *Done when:* index count matches indexable report count and a seeded lost/found
  pair matches.

- `[ ]` **T5. VLM layer switchable and honest.** `VLM_BASE_URL` points at any
  OpenAI-compatible server (vLLM / Ollama / LM Studio); `/health` states whether it
  is configured; every analyze response names which signals produced the attributes
  and never invents fields. *Done when:* no-VLM path explains the fallback; a
  configured VLM populates attributes with no code change.

### P1 — feature depth

- `[ ]` **T6. Tamper-evident chain of custody.** SHA-256 each row over its content
  plus the previous row's hash; add a verify endpoint and a test that mutates a row
  and proves detection. *Where:* `custodyService.js`, `OrgChainOfCustody.jsx`
  (~20 lines of `node:crypto`; idea from `forensicvault-chain`, implement ourselves).
- `[ ]` **T7. Owner alerts on QR scan.** Confirm the adopted `tagd` behaviour is
  complete (owner notified on scan; failed/suspicious scans logged; route
  rate-limited) and extend the alert channel to email (T12).
- `[ ]` **T8. Cross-modal consistency check.** Score agreement between image
  signals, text and detected attributes; flag contradictions for staff instead of
  trusting both. *Where:* `ai-service/app/core/matching.py`, match evidence.
- `[ ]` **T9. Normalise uploads before embedding.** JPEG conversion + square crop /
  normalisation ahead of the image encoder for faster CPU inference and more
  consistent embeddings. *Where:* `ai-service/app/core/preprocess.py`.
- `[ ]` **T10. Live CCTV ingest.** Uploaded clips only today; add RTSP / frame
  sampling with the same "item tracking only, never face recognition" rule.
  *Where:* `ai-service/app/core/cctv.py`, `OrgCCTV.jsx`.
- `[ ]` **T11. Analytics + audit exports.** CSV export and date-range presets for
  analytics; audit export with ordering guarantees. *Where:* `OrgAnalytics.jsx`,
  `OrgAuditLogs.jsx`, `analyticsController.js`.
- `[ ]` **T12. Email notifications.** No mail transport exists (in-app + SSE only).
  Add a provider-agnostic mailer and send on match found, verification
  required/result, return ready, item returned — with the same audit entries.
  *Where:* new `src/services/mailService.js`, wired from `notificationService.js`,
  config in `src/config/index.js`.

### P2 — ops, scale, tests

- `[ ]` **T13. Production-path infrastructure.** `docker-compose.yml` for Qdrant +
  Redis; document switching the local tiers to them without breaking clone-and-run.
- `[ ]` **T14. Object storage for deploys.** S3-compatible storage via `multer-s3`
  behind the existing upload-middleware contract.
- `[ ]` **T15. Observability.** AI request timings, warm-up duration, queue depth and
  vector tier in one status surface; structured match-run logs.
- `[ ]` **T16. One test command.** Wire `scripts/e2e.js`, `realtimeFlowCheck.js`,
  `sseCheck.js`, `ai-service/tests/*` and Playwright route smoke tests (Playwright is
  already a devDependency, currently unused).
- `[ ]` **T17. Query performance.** Index report/match lookups and review pagination
  before org lists grow.

---

## 5. Reference repos

Licence audit: [`github-repos-by-feature.md`](github-repos-by-feature.md). Clones in
`reference/` (gitignored). Safe to adapt (MIT/Apache-2.0 — keep the header, add to
`ATTRIBUTION.md`): **ReuniteAI**, **Reclaim-**, **CampusTrace**, **tagd**,
**cctv-footage-object-detection**, **FastAPIReranker**, **siglip**, **better-sse**,
**multer** (npm, not a clone).
Already adopted: verification escalates to review, QR-scan logging + owner alerts,
SSE resume/backpressure.
**Never copy:** `OpenProcessor` (AGPL-3.0), `forensicvault-chain` (licence unclear).

---

## 6. Run and verify

```bash
# start all three services (AI :8100, backend :5000, frontend :5173)
start-mern.cmd

# health
curl -s http://127.0.0.1:8100/health          # expect status "ok", vector_store "qdrant-local"
curl -s http://localhost:5000/api/health      # expect {"status":"ok"}

# vector durability (stop the AI service first - it holds the index lock)
cd mern/ai-service
.venv\Scripts\python.exe -m tests.vector_durability write
.venv\Scripts\python.exe -m tests.vector_durability read    # exit 0 = durable + tenant-safe

# browser: http://localhost:5173/   (hash routing: /#/login)
# demo logins, password lostlink123
#   student@abcschool.com -> user dashboard
#   staff@abcschool.com   -> organization dashboard (staff)
#   admin@abcschool.com   -> organization dashboard (admin)
```

---

## 7. Progress log

| Date | Item | Note |
| --- | --- | --- |
| 2026-09-28 | F1–F9 | Uploads proxy, host binding, PORT override, staff routing, warm-up, durable vector ladder, journalled queue, store close |
| 2026-09-28 | T1 | Durability test written; **exposed P0-A** (qdrant-client 1.19 removed `search()`) |
| 2026-09-28 | P0-A, T1 | `query_points` shim landed; durability test **passes** (write/read across processes + tenant isolation) |
| 2026-09-28 | T2 | Queue-journal replay **proven**: setup parks a report at `MATCHING` + journals a job, restart restores it, the run completes and the report leaves `MATCHING` |
| 2026-09-28 | Defect | A run that found 0 candidates left the report parked at `MATCHING` forever. `MATCHING` is now explicitly transient: the worker marks it on start and always settles it (matched → `POTENTIAL_MATCH`/`MATCHED`, none → `REPORTED`/`FOUND`, crash → settled on the failure path) |
| 2026-09-28 | T3 | Browser route smoke passes (14 checks) including the consolidation and legacy-URL redirects |
| 2026-09-28 | T4, T6, T9, T11–T17 | Reindex script, custody hash chain, EXIF/JPEG normalisation, CSV exports, health/ops surface, RTSP, docker-compose for Qdrant+Redis, storage contract, compound indexes, cross-modal consistency |
| 2026-09-28 | AI proof | `proof_match.py` **20/20 checks**: real SigLIP2 + BGE-M3 cosines, reranker ran, evidence reproducible from stored rows, tenant isolation, negative control gap 28.1 |
| 2026-09-28 | Health | `GET /health/models` (AI) + `GET /api/health/models` (gateway): per-model checkpoint, loaded, device, dimension and — on demand — a real micro-inference per model. Unconfigured optional models are `not_configured`, not "degraded" |
| 2026-09-28 | Pivot | Two dashboard shells, five member destinations, six organization destinations, every old URL redirected |
| 2026-09-28 | Defect | **Organization logos could never be saved.** The branding step downscales in the browser and sends the image inline as a data URL, but `logoUrl` shared the 2000-character `url()` cap — every real logo was rejected with a 400 and the wizard told the user "the logo could not be saved". `logoUrl` now has its own cap (400 KB, inside the 2 MB JSON body limit) and is accepted at **creation** as well, so signup no longer has to create the tenant and then PATCH branding onto it. The signup form's logo field was cosmetic — it kept the filename and submitted nothing |
| 2026-09-28 | Avatar upload | `POST /api/profile/avatar` (multipart, same engine as report photos: magic-byte check, `/uploads`, audit row). The profile form used to take a **pasted image URL**, so only people hosting an image somewhere had an avatar |
| 2026-09-28 | Cleanup | `ui/ImageUpload.jsx` deleted: unused, and it faked its progress bar with a `setInterval` while never uploading anything. `ui/ImageDrop.jsx` is now actually used (profile avatar) and gained a replace-on-drop + single-photo mode |
| 2026-09-28 | Coverage | e2e sections 12–13 added: avatar stored/served/reported/persisted/audited, wrong type refused with no orphan file, 401 without a session, logo accepted at create and update, oversized logo still refused. **227/227 checks** |
| 2026-09-28 | Motion layer | One motion system for all 36 routes. `ui/Motion.jsx` defines the shared primitives and the single easing curve; `PageHeader` animates itself in three 40ms beats, which is what gives every page (28 use it) the same entrance with no page-level code. New `.stagger` / `.stagger-fast` / `.tappable` utilities sequence grids and feeds, `animate-bar-grow` grows match meters and progress bars from their left edge, `SectionTabs` gained a sliding active indicator plus `SectionPanel` so a tab switch is a transition rather than a repaint, and the sign-in card re-enters on each step |
| 2026-09-28 | Defect (animation) | Entrances must not be JS-driven. A framer-motion entrance only advances while `requestAnimationFrame` runs, so a page that mounted in a background tab — or in this project's own preview webview, which produces no frames — rendered its title at `opacity: 0` and left it there. Every **mount-time** entrance is now a CSS keyframe (which always completes); framer-motion is kept only for **interaction-driven** motion, where the click itself proves frames are running. The `AppLayout` route fade moved to CSS for the same reason, removing a second way for the content area to come up blank |
| 2026-09-28 | Defect (animation) | Entrance keyframes now end on `transform: none` instead of `translateY(0)`/`scale(1)`. A retained transform makes the element a containing block, which silently breaks `position: sticky` underneath it (table headers, detail rails) |
| 2026-09-28 | Motion coverage | Verified per route in a real browser: **15 routes across both shells, every animated element ends visible (opacity 1) with no retained transform**; `stagger` delays confirmed at 40ms/24ms steps; 14/14 route checks; repo-root `npm test` 7 pass / 1 skip |
| 2026-09-28 | Motion: login & landing | The two marketing surfaces got the full pass. Login: org-detection banners slide down into the flow, the error banner shakes once per failed attempt (keyed so every new failure re-triggers it), dashboard-choice cards lift with the press dip, demo-credential buttons stagger in, the sign-in button got press feedback. Landing: hero enters in five beats (badge → headline → copy → CTAs → proofs), the pipeline demo card floats, the AI-vision frame announces itself with a radar ripple, attribute chips pop in sequence as the "AI is reading" beat, confidence bars grow from the left, marketing cards gained the shared hover-raise. Verified: 41 landing + 20 login animated elements all end visible, a real failed sign-in shows the banner at full opacity, 14/14 route smoke, full suite green |

---

## 8. Product pivot — two shells, eleven destinations

### The problem it fixes

The system had the functionality but not a product. Twenty-odd features were
nineteen sidebar entries, so the user had to know the data model (lost vs found,
report vs match vs verification vs return vs QR) before they could ask for help.

### Member shell — five destinations

| Destination | Contains |
| --- | --- |
| **Home** `/dashboard` | Active cases, recent matches, recovery progress, quick report |
| **Report** `/report` | Lost/Found selector → AI scan → attributes → where & when → submit. One entry point; the form body is the existing, proven component |
| **Matches** `/matches` | Candidate matches + evidence + review (`/matches/:id`, `/matches/:id/verify`) |
| **Recovery** `/recovery` | Cases (report details) and Returns & QR |
| **Notifications** `/notifications` | Match, verification and return updates |

Profile, Settings and Organizations live in the avatar menu — they are account
administration, not part of the recovery workflow.

### Organization shell — six destinations

| Destination | Contains |
| --- | --- |
| **Overview** `/organization/overview` | KPIs, pipeline, recent activity, launch cards |
| **Recovery Queue** `/organization/recovery` | Lost & Found + AI Matching |
| **Verification** `/organization/verification` | Ownership claims, review and decisions |
| **Operations** `/organization/operations` | Inventory, Chain of Custody, Last Seen & CCTV |
| **Insights** `/organization/insights` (manager) | Analytics, Audit Logs, **AI Models** |
| **People & Settings** `/organization/people` | Members, roles, organization settings |

### How it was implemented without a rewrite

* Every consolidated page is a **shell**: a URL-synced tab bar (`SectionTabs`,
  `?tab=`) over the existing, already-verified page components. No verified flow
  was reimplemented to fit the new navigation.
* **Two dashboard shells, `variant="user"` and `variant="org"`** — unchanged; the
  role guards still decide access, and Insights stays manager-only.
* **Old URLs keep working**: `/report-lost` → `/report?type=lost`,
  `/my-reports` → `/recovery?tab=cases`, `/organization/lost-found` →
  `/organization/recovery?tab=reports`, and so on. Detail URLs that moved keep
  their id (`/ai-matches/:id` → `/matches/:id`).
* Internal links were repointed at the canonical paths, so a deep link into an
  org report still arrives with its focus id instead of being swallowed by a
  redirect.

### The AI Models panel

The pivot added one genuinely new surface, in Insights: the model inventory. It
lists each checkpoint with its role, device and dimension, and a **Verify with
real inference** action that runs one micro-inference per model and quotes the raw
result (`read() returned 1 line(s), text='ABC-123'`, `embed_images() returned a
768-dim unit vector`). "Ready" is never used as evidence on its own.
