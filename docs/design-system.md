# LostLink AI — UI/UX Audit, Information Architecture & Design System

Status: the redesign is implemented against the rules in this document.
Last updated: 2026-09-28

---

## 1. Audit of the product as it was

### 1.1 What was actually broken

| Finding | Evidence | Why it mattered |
|---|---|---|
| **The auth surface was never migrated** | `LoginPage.jsx` used emoji icons (`✉ 🔒 👁 🙈 📷 🏫 🎒`), a `#fef9c3` sticky-note panel, and `flow-line` | The first screen a user sees looked like a different, older product |
| **A CSS class the page depended on did not exist** | `LoginPage` root was `min-h-screen auth-gradient`; `index.css` no longer defined `.auth-gradient` | The login page rendered on a bare white background |
| **Legacy links everywhere** | `NotificationItem` → `/ai-matches/…`, `/my-reports/…`; `ReportDetail` → `/ai-matches/…`; `TrackReturn` → `/track-return/…` | Every click paid a redirect hop, and a bookmarked legacy URL was load-bearing |
| **A navigation control bypassed the router** | `Sidebar` used `window.location.hash = '/dashboard'` | Full-page reload instead of a client transition |
| **Duplicate metric layers** | `UserDashboard` had hero actions + a 5-stage pipeline + 4 stat tiles + a match card before any real content; `AIMatches` had 4 tiles + tabs; `TrackReturn` had 3 tiles | The user had to scroll past three summaries to reach one actionable row |
| **Colour was decorative** | `StatCard` shipped an `amber / violet / sky / rose / indigo` rainbow chosen per screen | Violated "colour carries meaning"; read as a generic dashboard template |
| **Text competed with content** | `OrgDashboard` title "…​ command center"; multi-sentence subtitles on every page; a full disclaimer paragraph under the match list; a 4-step explainer above the report form | The most important action was never the most prominent thing |
| **The landing page was 630 lines / 11 sections** | Hero *and* a dedicated AI section rendered the same pipeline visual twice; three separate dark panels | A visitor could not extract the one sentence that matters |
| **Forms were monoliths** | `ReportLost` / `ReportFound` rendered every field at once | Highest-friction step in the product was also the densest screen |
| **No shared primitives** | Every page re-invented its filter bar, chip row and empty state | Drift: the same concept looked different on two screens |
| **No organisation onboarding** | Org creation was a 2-field step inside the login card; the "Logo" input only stored a filename and nothing used it | A multi-tenant product with no tenant setup |

### 1.2 What was already good and had to be preserved

- The **route consolidation** (5 member destinations, 6 organisation destinations) and its legacy redirects.
- The **backend contract** — every hook in `lib/queries.js` and every method in `lib/api.js` stays as-is.
- **Verified flows**: ownership challenge, one-time QR handover, chain of custody, CCTV honesty, SSE resume. The redesign touches presentation only.
- The **elevation-over-borders** direction, `cn()` + `cva` component pattern, and the teal `brand` ramp.

---

## 2. New information architecture

### 2.1 The one idea

The product answers exactly five questions, in this order, and the navigation is the five answers:

> **Report** what happened → **Search** what exists → **Match** the two → **Verify** who owns it → **Return** it

Everything else is context on one of those five.

### 2.2 Roles → destinations

| Role | Portal | Destinations |
|---|---|---|
| member (`student`, `employee`) | Personal | 5 (Home · Search · Report · Matches · Recover) |
| staff / security | Organisation | 6 (Overview · Recovery · Verification · Operations · Insights · People) |
| admin / owner | Organisation **and** Personal | 6 + 5, switched from the avatar menu |

### 2.3 Route map (canonical)

**Public**
```
/                 Landing
/login            Auth (sign in · join · create org · verify)
```

**Personal**
```
/dashboard                 Home          — act now
/search                    Search        — visual discovery + detail drawer
/report?type=lost|found    Report        — 5-step guided wizard
/matches                   Matches       — gallery
/matches/:id               Match detail  — pair + evidence analysis
/matches/:id/verify        Owner challenge
/recovery?tab=cases|returns  Recover
/recovery/:id              Report detail
/recovery/:id/qr           One-time handover code
/profile  /settings  /notifications        Account (avatar menu / mobile nav)
```

**Organisation**
```
/organization/overview                       Overview
/organization/recovery[?tab=reports|matches] Recovery queue
/organization/recovery/:id                   Candidate review
/organization/verification[/:id]             Claims
/organization/operations[?tab=items|custody|last-seen]
/organization/insights[?tab=analytics|audit|models]   (manager only)
/organization/people[?tab=people|settings]            (manager only)
```

Every pre-consolidation URL redirects into the canonical one and keeps its `:id`.

**Mobile bottom navigation** — `Home · Search · Report · Matches · Profile`. `Report` is the raised centre action; `Profile` absorbs settings, notifications and organisations.

### 2.4 Screen hierarchy contract

Every screen is built in this order and may omit lower tiers, never reorder them:

```
1  PRIMARY ACTION      one, visually dominant (a button or the item itself)
2  IMPORTANT INFO      the 3-6 facts needed to take that action
3  SECONDARY INFO      supporting lists, filters, history
4  OPTIONAL DETAIL     descriptions, raw scores, audit facts
```

Tier 4 is collapsed by default (`<details>`, drawer, or a "technical detail" disclosure).

---

## 3. Design system

### 3.1 Principles

1. **Elevation over borders.** A resting surface is white + `shadow-soft`, borderless. A border appears only on hover, on inputs, and on intentional dividers.
2. **One primary accent.** Teal `brand`. Blue `accent` is secondary and informational only.
3. **Colour means something.** Green = success, amber = warning, red = error/destructive. Nothing else is coloured for decoration.
4. **Whitespace is the layout.** 8px rhythm; sections 24px apart; card padding 20–24px.
5. **Progressive disclosure.** Tier 4 is hidden until asked for.
6. **Short copy.** A heading is ≤ 5 words, a subtitle is one line, an empty state is one sentence plus one action.
7. **Motion is feedback, never decoration.** 150–280ms, `ease-spring`, and it honours `prefers-reduced-motion`.

### 3.2 Tokens

**Type** — Inter. Scale: `11 / 12 / 13 / 14 / 16 / 20 / 24 / 30 / 40`. Weights `400 / 500 / 600 / 700 / 800`.
Headings use `brand.ink` (`#0B1220`); body uses `slate.600`; meta uses `slate.400`.

**Colour**
| Purpose | Token |
|---|---|
| page | `#F7F9FB` |
| surface | `white` |
| ink (headings) | `brand.ink` `#0B1220` |
| primary accent | `brand.500–700` (teal) |
| secondary accent | `accent.500–600` (blue) |
| success | `emerald.600` |
| warning | `amber.500–600` |
| error | `red.600` |
| neutral text | `slate.400 / 600 / 900` |

**Elevation** — `xs, soft, card, pop, lift, ring, glow`. `soft` is the resting card. `lift` is hover.

**Radius** — `lg 12 · xl 12 · 2xl 16 · 3xl 20 · 4xl 24 · full`.

**Space** — `1=4px … 6=24px`, `8=32px`, `10=40px`, `12=48px`, `16=64px`.

### 3.3 Component inventory

| Component | File | Contract |
|---|---|---|
| `Button` | `ui/Button.jsx` | `primary · secondary · ghost · subtle · outline · danger · link`; `xs…icon` |
| `Card` (+`CardHeader`,`CardTitle`) | `ui/Card.jsx` | `padding: none/sm/md/lg`, `tone: plain/interactive/glass` |
| `Badge` | `ui/Badge.jsx` | semantic only: `neutral, primary, success, warning, danger, info` |
| `Stat` | `ui/Stat.jsx` | `tone: neutral / positive / attention / critical` — no rainbow |
| `StatCard` | `StatCard.jsx` | dashboard tile (kept as the app-wide API) |
| `StatusBadge` | `StatusBadge.jsx` | maps a domain status → tone + label |
| `Field` | `ui/Field.jsx` | label + hint + error + input/select/textarea |
| `Segmented` | `ui/Segmented.jsx` | pill tab bar with a sliding indicator |
| `Sheet` | `ui/Sheet.jsx` | right-side drawer for tier-3/4 detail |
| `ItemCard` | `ui/ItemCard.jsx` | the visual unit of Search and Matches |
| `MatchMeter` | `ui/MatchMeter.jsx` | score + band (High/Medium/Low), never a bare % |
| `ImageDrop` | `ui/ImageDrop.jsx` | drag-drop photo step with preview |
| `Timeline` | `Timeline.jsx` | vertical stepper |
| `EmptyState` | `EmptyState.jsx` | one sentence + one action |
| `Skeleton*` | `ui/Skeleton.jsx` | `Skeleton · Text · Card · Stats · List · Table` |
| `Modal`/`ConfirmDialog` | `Toast.jsx` | overlay + confirm |
| `Toast` | `Toast.jsx` | success / error / info |

### 3.4 Quality gate per screen

- Is there exactly one dominant action?
- Can a first-time user act within five seconds without reading a paragraph?
- Is every colour meaningful?
- Does the empty state offer a real next step?
- Is there a skeleton for the loading state and a `ErrorState` for the failure state?
- Does it hold at 360px, 768px and 1440px?
