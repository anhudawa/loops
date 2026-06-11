# "Where should I ride today?" — IA Redesign

**Date:** 2026-06-11 · **Owner:** EXPERIENCE BM · **Authority:** CEO north star (ORG.md)
**Principle:** Every page is judged by how directly it answers the one question.
**Evidence base:** comprehensive roadmap items N2/N3/N7
(`docs/superpowers/plans/2026-06-11-comprehensive-roadmap.md`).

## 1. The answer machine — logged-in homepage (`src/app/_components/HomeClient.tsx`)

Logged-in riders never see marketing. The page IS the answer, top to bottom:

1. **AppHeader** (shared, §3) — sticky, top.
2. **The question card** — "Where should I ride today?" as the heading; one
   prominent text input (natural language, placeholder "e.g. 2 hours, rolling
   hills, tailwind home"); submit → `/generate?q=<encoded>`; beside it two
   quick actions: **Draw a route** → `/plan` and **Browse nearby** → scroll to
   `#scroll-anchor`. Phase 2 adds **Surprise me** (pre-canned prompt from
   geolocation + weather → `/generate?q=...&auto=1`).
3. **TODAY strip** (Phase 2) — local wind/weather from `src/lib/wind.ts` via a
   new `/api/today` endpoint: "NW 22 km/h — head out north, tailwind home".
   Honesty rule applies: under 8 km/h, say wind isn't worth planning around.
4. **Near you** — the existing route feed (`fetchRoutes` already geo-sorts);
   default sort stays "Nearby · Best rated".
5. **Destinations rail** — `FeaturedCollections` + a `/cycling` link row.
6. **NO HeroSection** for logged-in users. The marketing hero
   (`src/components/HeroSection.tsx`) renders only when logged out.

## 2. Logged-out homepage

- Headline IS the question: "Where should I ride today?" — replaces "Stop
  Riding The Same Loop" (`HeroSection.tsx:96`, Phase 2 copy change).
- ONE CTA: "Answer it" → `/login?redirect=/generate`. Hero shrinks to compact
  (`min-h-[60vh]` cap at all breakpoints, Phase 2); real routes visible within
  one swipe below. Stats row stays (it is evidence, not marketing).

## 3. Shared AppHeader (`src/components/AppHeader.tsx`) — Phase 1, shipped

Replaces the 7 logo/header variants (roadmap §1.4: `HomeClient.tsx:313`,
`login/page.tsx:183`, `cycling/page.tsx:19`, `cycling/[destination]/page.tsx:51`,
`collections/page.tsx:28`, `MapPlanner.tsx:201`, headerless `/generate`).

- **One logo treatment:** `logo-mark` LOOPS, `color: var(--text)`, links home.
- **One nav, mobile-first:** Plan → `/generate`, Draw → `/plan`, Routes → `/`,
  Destinations → `/cycling`. At <md the nav is a second row — ALL four links
  visible at 375px, ≥44px tap targets, horizontal scroll as overflow valve.
  Active link gets accent. No `hidden sm:` on primary actions ever again (N2).
- **Auth controls** (pattern lifted from `HomeClient.tsx:340-394`): logged in →
  Upload route (accent, icon-only <md), admin badge, messages icon + unread
  count, avatar → profile, Sign out. Logged out → Log in (text) + Sign up
  (accent). Client component; `useAuth()` from `src/components/AuthProvider.tsx`.
- `sticky` prop (default true); `/plan` passes `sticky={false}` inside a
  `100dvh` flex column so the map keeps its viewport.

## 4. One vocabulary

- **"Plan"** = the feature (both modes: describe at `/generate`, draw at `/plan`).
- **"route"** = the object. "Loop" survives only in the brand name. Kills the
  four-label drift (roadmap N7) and "Share Loop" → **"Upload route"** (Phase 1).

## 5. Page-by-page disposition

| Page | Contribution to the question | Action |
|---|---|---|
| `/` | THE answer machine (§1) | Phase 1: question card, AppHeader, hero hidden for logged-in |
| `/generate` | Answers it from words. Reads `?q=`, prefills, auto-runs ≥10 chars | Phase 1: AppHeader + `q` param; was a headerless dead-end |
| `/plan` | Answers it by hand — draw, snap, GPX | Phase 1: AppHeader above toolbar; toolbar loses its duplicate logo |
| `/cycling` + `/cycling/[destination]` | Answers it for trips: "ride HERE" | Phase 1: AppHeader replaces both bespoke headers; per-destination "Plan a ride in X" CTA stays |
| `/collections` | Curated answers ("ride one of these eight") | Phase 1: AppHeader. Phase 2: merge into the `/` destinations rail; keep URL |
| `/routes/[id]` | A single concrete answer | Phase 2: AppHeader + "Ride something like this" → `/generate?q=` prefill |
| `/login` | Gate, not a landing page | Phase 2: demote 573-line marketing page to plain auth card; fix the false export claim (`login/page.tsx:85`); move SEO copy to `/cycling` |
| `/upload` `/profile` `/messages` `/admin` | Supply + account plumbing | Reached from AppHeader auth cluster only; never primary nav |

**Cut/merged:** duplicate Plan/Draw chips in the old homepage header (AppHeader
owns them); MapPlanner's own logo; `/login` as a second landing page (Phase 2).

## 6. Phase 2 backlog (not in today's diff)

1. TODAY wind/weather strip + `/api/today` (reuse `src/lib/wind.ts`).
2. "Surprise me" quick action (geolocated canned prompt, auto-run).
3. Logged-out hero copy swap to the question + single CTA; compact height.
4. `/login` demotion + honest export copy; `/routes/[id]` AppHeader adoption.
5. Playwright render gate at 375/768/1440 for AppHeader on all six pages.
