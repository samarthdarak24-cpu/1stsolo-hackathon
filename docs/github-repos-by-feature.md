# GitHub reference repos, per feature

Research for LostLink AI: for each feature in this project, the public repos worth
looking at, what each one actually contains, its **license**, and a verdict.

Nothing was cloned into this repo. Everything below was read first (README + file
tree + license via the GitHub API) — that is the point of this document: **check
before you download.**

## How to read the verdict

| Verdict | Meaning |
| --- | --- |
| ✅ **Safe** | Permissive license (MIT / Apache-2.0). Clone it, adapt the code, keep the attribution. |
| 📖 **Reference only** | No license file, or the license is unclear. Public ≠ public domain — reading it for ideas is fine, copying files into this project is not, unless you ask the author. |
| 🛑 **Do not copy** | Copyleft (AGPL/GPL). Vendoring that code would impose its terms on this whole application. Read for architecture only. |
| 📦 **Already covered** | This repo already ships it — do not add another dependency or repo for it. |

---

## 1. Feature map: this project → reference repo

### Report a lost / found item (multi-step form + AI item scan)

| | |
| --- | --- |
| **Our code** | `mern/frontend/src/pages/ReportLost.jsx`, `ReportFound.jsx` → `POST /api/ai/analyze-item` (`mern/backend/src/controllers/aiController.js`) → `mern/ai-service/app/routers/inference.py` (`/analyze-item`) |
| **Reference** | [oluwakayodemike/ReuniteAI](https://github.com/oluwakayodemike/ReuniteAI) — MIT |
| **Why** | Closest overall product: report flow, image upload (client converts to JPEG, optional 224×224 crop for CLIP), AI matching, claim verification, notifications. Read how it normalises uploads before embedding. |
| **Verdict** | ✅ Safe (MIT) |

Also: [MihisaraNet/CampusTrace](https://github.com/MihisaraNet/CampusTrace) — MIT,
MERN lost & found with JWT auth, **Cloudinary image uploads**, claim verification and
an admin mediation hub. Good UI/flow comparison for the reporting screens. ✅ Safe.

---

### Item photo upload (the feature just added)

| | |
| --- | --- |
| **Our code** | `POST/DELETE /api/reports/:id/image` (`src/routes/api.js`) → `reportService.addReportImage` / `removeReportImage` → `src/middleware/upload.js` (multer disk storage + magic-byte sniffing) → UI `ItemPhoto` in `src/pages/ReportDetail.jsx` |
| **Reference** | [expressjs/multer](https://github.com/expressjs/multer) — MIT (already a dependency, `multer@^2.4.0`) |
| **For object storage** | [anacronw/multer-s3](https://github.com/anacronw/multer-s3) — MIT (`multer-s3` on npm). Use the **npm package**, not a clone. Our `upload.js` already documents this swap: replace `storage`, keep the controller contract. |
| **Verdict** | 📦 Already covered for disk; ✅ add `multer-s3` (npm) only when deploying |

Note: [HitsukiMok/KyuR](https://github.com/HitsukiMok/KyuR) is the MERN repo whose
README matches our ambitions (S3 image storage + Socket.io), but its `license` field
is **null** → 📖 Reference only.

---

### AI matching (candidates + evidence)

| | |
| --- | --- |
| **Our code** | `src/services/matchingService.js` (heuristic scorer, 7 weighted signals), `aiWorker.js` + `aiQueue.js` (background jobs), `mern/ai-service/app/core/matching.py` + `pipeline.py` (retrieve → rerank → fuse → explain) |
| **Reference** | [Minukweerakoon/Reclaim-](https://github.com/Minukweerakoon/Reclaim-) — MIT |
| **Why** | Multimodal *validation* of a report rather than just ranking: YOLOv11 + CLIP alignment, spaCy NER, Whisper, and a **cross-modal consistency engine** (image vs. text vs. voice) with confidence weighting. That consistency check is the idea worth taking — we validate image and text separately today. |
| **Verdict** | ✅ Safe (MIT) |

ReuniteAI (above) also covers matching: hybrid vector + full-text search over CLIP
embeddings. ✅ Safe.

---

### Embeddings & vector search (SigLIP2, BGE-M3, Qdrant)

| | |
| --- | --- |
| **Our code** | `mern/ai-service/app/routers/embeddings.py` (`/embed/image`, `/embed/text`), `app/providers/` (SigLIP2 / BGE-M3), `app/vector/store.py` (Qdrant with in-process fallback), `aiClient.js` in Node |
| **Reference** | [merveenoyan/siglip](https://github.com/merveenoyan/siglip) — Apache-2.0 (FAISS indexing + image search: `image_search.py`, `clip_siglip.py`, notebooks) |
| **Verdict** | ✅ Safe (Apache-2.0 — keep attribution/NOTICE) |

Also verified:
- [acewebs/fastapi-qdrant-starter](https://github.com/acewebs/fastapi-qdrant-starter) — MIT, FastAPI + Qdrant wiring. ✅ Safe, small.
- [porameht/image-search-qdrant](https://github.com/porameht/image-search-qdrant) — **no license** → 📖 Reference only.
- [myeolinmalchi/bge-m3-fastapi](https://github.com/myeolinmalchi/bge-m3-fastapi) — **no license** → 📖 Reference only.

---

### Reranking

| | |
| --- | --- |
| **Our code** | `POST /rerank` in `mern/ai-service/app/routers/inference.py` (BGE-reranker-v2-m3, `app/providers/reranker.py`) |
| **Reference** | [ToeiRei/FastAPIReranker](https://github.com/ToeiRei/FastAPIReranker) — MIT |
| **Why** | The same job as a standalone microservice: FastAPI + Dockerfile + docker-compose. Useful as a pattern if we want the reranker containerised separately from the rest of the AI service. |
| **Verdict** | ✅ Safe (MIT) |

---

### Ownership / claim verification

| | |
| --- | --- |
| **Our code** | `src/services/verificationService.js` (challenge built from item evidence, graded similarity), `VerifyOwnership.jsx`, org review in `OrgVerification.jsx` |
| **Reference** | [oluwakayodemike/ReuniteAI](https://github.com/oluwakayodemike/ReuniteAI) — MIT |
| **Why** | "Fraud-resistant claim flow": the LLM answers a **binary yes/no** at `temperature=0`, any invalid output falls back to manual review, and approval issues a pickup code. Our flow already withholds `challenge` / `expectedEvidence` from the client; the fallback-to-review rule is the part worth copying. |

---

### Return with QR + OTP

| | |
| --- | --- |
| **Our code** | `src/services/returnService.js` (QR via `qrcode@^1.5.4`, OTP, expiry, `refresh-qr`, `scan-qr`), `ReturnQr.jsx`, `TrackReturn.jsx` |
| **Reference** | [stoneset/tagd](https://github.com/stoneset/tagd) — MIT |
| **Why** | Self-hosted QR tracking for lost items with **scan logs + Discord/email alerts**. Notifying the owner the moment their tag is scanned is a feature we do not have. |
| **Verdict** | ✅ Safe (MIT) |

- [chenasraf/express-otp](https://github.com/chenasraf/express-otp) — MIT, OTP middleware. 📦 we already generate/verify OTPs ourselves; read only if you want to externalise it.
- [akessaris/lost-and-found-qr](https://github.com/akessaris/lost-and-found-qr) — Express/Mongo/Passport with printable QR stickers, but **no LICENSE file** → 📖 Reference only.

---

### Chain of custody

| | |
| --- | --- |
| **Our code** | `src/services/custodyService.js` (append-only ledger, 8 event types), `OrgChainOfCustody.jsx` |
| **Reference** | [rep3protocol/forensicvault-chain](https://github.com/rep3protocol/forensicvault-chain) — license `NOASSERTION` |
| **Takeaway** | SHA-256-hash each custody row so the ledger becomes tamper-evident, plus a "tamper test" that proves it. |
| **Verdict** | 🛑 Do not copy (license unclear) — implement the hash chain ourselves, it is ~20 lines of `node:crypto` |

---

### CCTV / last-seen analysis

| | |
| --- | --- |
| **Our code** | `src/services/cctvService.js`, `mern/ai-service/app/core/cctv.py`, `OrgCCTV.jsx` — item tracking only, **never face recognition** |
| **Reference** | [lakshan-bandara/cctv-footage-object-detection](https://github.com/lakshan-bandara/cctv-footage-object-detection) — MIT |
| **Why** | YOLOv8 on CCTV streams: RTSP handling, tracking, OpenCV frame sampling. Good reference for real camera input, which our clip-upload path does not cover. |
| **Verdict** | ✅ Safe (MIT) |

- [nghiang/cctv-analyzer](https://github.com/nghiang/cctv-analyzer) — YOLO26n + ByteTrack +
  MediaPipe (same detector generation as ours) but **no license** → 📖 Reference only.
- [davidamacey/OpenProcessor](https://github.com/davidamacey/OpenProcessor) — the most
  complete self-hosted vision pipeline (Triton + TensorRT + CLIP + OCR + OpenSearch), and it
  says plainly in its README: **AGPL-3.0-or-later**, re-badged from MIT because it vendors an
  AGPL Ultralytics fork. → 🛑 Read its `docs/` for ideas; copy no source files.

---

### Real-time notifications (SSE)

| | |
| --- | --- |
| **Our code** | `src/realtime/events.js` (in-process SSE bus, org + user scoping), `src/lib/useLiveEvents.js` (reconnect + query invalidation) |
| **Reference** | [MatthewWid/better-sse](https://github.com/MatthewWid/better-sse) — MIT, 836★ |
| **Takeaway** | Spec edge cases our hand-rolled stream should handle: `Last-Event-ID` resume, backpressure. We already do heartbeats and tenant scoping. |
| **Verdict** | 📦 Already covered — read for edge cases; swap only if we need resume across restarts |

Avoid the `mruderman/better-sse` fork: same code, forked. The canonical repo is `MatthewWid/better-sse`.

---

### Auth, orgs, roles, audit, analytics

| | |
| --- | --- |
| **Our code** | `routes/auth.js`, `middleware/auth.js`, `services/orgContext.js` (role → permission matrix), `auditService.js`, `analyticsController.js`, `OrgAnalytics.jsx` (recharts) |
| **Reference** | [MihisaraNet/CampusTrace](https://github.com/MihisaraNet/CampusTrace) — MIT (JWT auth + admin mediation) |
| **Verdict** | ✅ Safe. JWT, bcrypt and rate limiting are 📦 already in `backend/package.json` |


---

### Whole-app comparisons (read the architecture, borrow the flow)

| Repo | Stack | License | Verdict |
| --- | --- | --- | --- |
| [oluwakayodemike/ReuniteAI](https://github.com/oluwakayodemike/ReuniteAI) | CLIP + TiDB vector search, LLM claim verification, pickup codes | MIT | ✅ Safe — closest product |
| [Minukweerakoon/Reclaim-](https://github.com/Minukweerakoon/Reclaim-) | React + FastAPI, YOLOv11 / CLIP / spaCy / Whisper validators | MIT | ✅ Safe — best AI-validation design notes (`docs/REPRODUCIBILITY.md`) |
| [MihisaraNet/CampusTrace](https://github.com/MihisaraNet/CampusTrace) | MERN, Cloudinary, JWT, admin hub | MIT | ✅ Safe — UI/flow comparison |
| [stoneset/tagd](https://github.com/stoneset/tagd) | JavaScript, QR scan logs, Discord/email alerts | MIT | ✅ Safe |
| [HitsukiMok/KyuR](https://github.com/HitsukiMok/KyuR) | MERN, AWS S3, Socket.io, QR | **none** | 📖 Reference only |
| [ipranavprashant/Lost-and-Found-Management-System](https://github.com/ipranavprashant/Lost-and-Found-Management-System) | MERN, Kafka, socket.io | README says MIT, **no LICENSE file** | 📖 Reference only — ask or verify first |
| [milinkanu/FoundIt](https://github.com/milinkanu/FoundIt) | Next.js + MongoDB, smart matching | **none** | 📖 Reference only |
| [singhkkrish/TRACEIT](https://github.com/singhkkrish/TRACEIT) | JavaScript | **none** | 📖 Reference only |
| [davidamacey/OpenProcessor](https://github.com/davidamacey/OpenProcessor) | FastAPI + Triton + TensorRT | **AGPL-3.0** | 🛑 Do not copy code |

---

## 2. Already covered — do not download for these

Everything here is already a dependency or working code in this repo:

- multipart uploads → `multer@^2.4.0` · QR codes → `qrcode@^1.5.4`
- JWT auth → `jsonwebtoken` + `bcryptjs` · rate limiting → `express-rate-limit` + `helmet`
- request validation → `zod@^4` (backend **and** frontend)
- data fetching/cache → `@tanstack/react-query` · routing → `react-router-dom`
- charts → `recharts` · UI → Tailwind + Radix + `lucide-react`
- SSE realtime → `src/realtime/events.js` · email/OTP/reset → `authService.js`
- vector store → Qdrant with in-process fallback (`app/vector/store.py`)
- inference → FastAPI service with lazy per-provider loading, degrades signal-by-signal

---

## 3. How to download the safe ones

Clone into `reference/` at the repo root (already `.gitignore`d — reading material,
not source we ship):

```powershell
cd c:\Users\darak\Downloads\hackathon1
mkdir reference -Force
cd reference

# ✅ MIT / Apache-2.0 — safe to adapt (keep the copyright header)
git clone --depth 1 https://github.com/oluwakayodemike/ReuniteAI.git
git clone --depth 1 https://github.com/Minukweerakoon/Reclaim-.git
git clone --depth 1 https://github.com/MihisaraNet/CampusTrace.git
git clone --depth 1 https://github.com/stoneset/tagd.git
git clone --depth 1 https://github.com/lakshan-bandara/cctv-footage-object-detection.git
git clone --depth 1 https://github.com/ToeiRei/FastAPIReranker.git
git clone --depth 1 https://github.com/acewebs/fastapi-qdrant-starter.git
git clone --depth 1 https://github.com/merveenoyan/siglip.git            # Apache-2.0
git clone --depth 1 https://github.com/MatthewWid/better-sse.git
git clone --depth 1 https://github.com/expressjs/multer.git

# 📖 Reference only — read, do not copy files (no license)
git clone --depth 1 https://github.com/HitsukiMok/KyuR.git
git clone --depth 1 https://github.com/nghiang/cctv-analyzer.git
git clone --depth 1 https://github.com/akessaris/lost-and-found-qr.git
```

**Deliberately not cloned:** `davidamacey/OpenProcessor` (AGPL-3.0) — its `docs/`
are fine to read online, but vendoring its code would obligate this whole app.

When you adapt a MIT file, keep its copyright header and add the repo to
`ATTRIBUTION.md`. Apache-2.0 additionally wants a NOTICE entry.

---

## 4. What was checked, exactly

- README + file tree of each candidate, to confirm the feature really is in there
  and where it lives.
- GitHub API metadata for **license** (`spdx_id`), stars, language, last push.
- Where a README claimed a license the tree did not actually contain (e.g. "MIT"
  with no LICENSE file), the verdict is downgraded to *Reference only*.

Feature areas searched: lost-and-found MERN platforms, AI/CLIP item matching, item
photo upload + S3, QR return flow, chain-of-custody ledgers, CCTV object detection,
FastAPI + Qdrant + BGE-M3 + reranker services, SSE, OTP.

---

## 5. Adopted into this codebase (27 Sep 2026)

The clones now live in `reference/` (gitignored). Three patterns were adapted
into our own code — details and file paths in [`ATTRIBUTION.md`](../ATTRIBUTION.md):

| Pattern | Source (license) | Where it landed |
| --- | --- | --- |
| Verification falls back to manual review instead of dead-ending | ReuniteAI (MIT) | `verificationService.js` — exhausted attempts escalate to `REVIEW` + reviewer notifications + `VERIFICATION_ESCALATED` audit |
| Every scan logged; owner alerted on suspicious/failed scans; scan route rate-limited | tagd (MIT) | `returnService.js` (`QR_SCAN_FAILED` rows + owner `SYSTEM` alerts), `routes/api.js` |
| SSE `Last-Event-ID` resume, bounded replay ring, slow-consumer backpressure | better-sse (MIT) | `realtime/events.js` + `lib/useLiveEvents.js` |

Building on the SSE work, every feature now pushes live entity events
(`REPORT_UPDATE`, `MATCH_UPDATE`, `VERIFICATION_UPDATE`, `RETURN_UPDATE`,
`CUSTODY_UPDATE`, `ORGANIZATION`) from its own mutation point, the client maps
them to the right query invalidations (dashboards, audit, queues) and shows
toasts for user-addressed alerts. Proven end-to-end by
`node scripts/sseCheck.js` (event-bus mechanics) and
`node scripts/realtimeFlowCheck.js` (live server: publish → stream → resume).

Everything else in the table above was either 📦 already covered by this repo's
own code, read-only reference, or 🛑 license-blocked.

*Last verified: 27 Sep 2026. Re-check the license before copying — repos get
re-licensed, and API metadata can lag.*

| **Verdict** | ✅ Safe (MIT) |
