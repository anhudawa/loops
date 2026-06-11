# LOOPS Full-Project Review — QUALITY Branch Manager

**Date:** 2026-06-11 · **Reviewer:** QUALITY Branch Manager · **Scope:** whole project, all three pillars
**Mandate:** CEO reports the PLAN feature ("Plan a ride", `/generate`) "isn't working" — a user typed a
2-hour workout prompt on mobile and got no result. Investigate from source, then review the whole
project against `ENGINEERING-STANDARD.md`. **Review only — no code changed.**

**Gate status at review time:**
- `npm test` → **190 passed (14 files)**, exit 0. ✅
- `npx tsc --noEmit` → **clean**, exit 0. ✅
- (Build/lint/CI not re-run here; CI pipeline is still the open N4 roadmap item.)

> Note on the roadmap: several headline claims in `2026-06-11-comprehensive-roadmap.md` are **already
> fixed** in the current tree and should be marked done. `AppHeader.tsx` is now the single shared header
> and is mounted on `/generate` (`generate/page.tsx:279`) and `/plan` (`PlanClient.tsx:24`); the homepage
> CTAs are no longer `hidden sm:` (rebuilt as the AnswerMachine, `HomeClient.tsx:106-171`); `/plan` and
> `/generate` both link back home via the header logo. The "dead-end pages / four bespoke headers /
> hidden mobile CTAs" findings are **stale**. This review supersedes them with the current state.

---

## PART 1 — PLAN feature: "isn't working" root-cause (file:line)

The flagship path is: homepage input → `router.push('/generate?q=…')` (`HomeClient.tsx:123`) →
`/generate` auto-runs generation (`generate/page.tsx:188-196`) → `POST /api/generate-route` →
`generateRouteCandidates` (LLM intent → library/BRouter/Overpass/Open-Meteo → score). The page **does**
have a visible submit button (`generate/page.tsx:409-420`) and a header. So "no result" is not a missing
button. The real failure modes, most-likely first:

### RC1 — (P0) Honest "decline" reads as "broken" for workout prompts
A 2-hour **workout** prompt is exactly the input most likely to hit the honesty decline path. When no
road corridor can hold the efforts, the pipeline throws and the API returns **422 `NO_WORKOUT_MATCH`**
(`api/generate-route/route.ts:200-205`). The client renders this in a red `ErrorPanel`
(`generate/page.tsx:423`, `553-592`) with the hint "Try a shorter interval, a different zone…". This is
the spec's intended honesty behaviour — but to a mobile user it is indistinguishable from a crash:
red box, no route, no obvious next action. **The feature is working as designed and the user still
experiences "it's broken."** That UX gap is the most probable explanation for the CEO's report.
*Fix:* turn the decline into a constructive result card (offer the closest non-workout loop, a shorter
rep, or the quick-form) instead of a bare red error. Owner: **PLAN**.

### RC2 — (P0) No timeout on the Anthropic call → slow path can burn the whole 55s budget
`parseRouteIntent` constructs `new Anthropic()` and calls `messages.create(...)` with **no timeout and
no `AbortSignal`** (`route-intent.ts:431-443`). The Anthropic SDK default timeout is ~10 minutes. The
deterministic `parseBasicIntent` fallback (`route-intent.ts:455-467`) only runs if the LLM call
**throws** — a *slow* call never throws, so the fallback never fires. On a slow LLM, the request rides
until the route-level `PIPELINE_TIMEOUT_MS = 55_000` race rejects (`api/generate-route/route.ts:12,
113-119, 128-134`), returning **504 `TIMEOUT`**. On Vercel hobby/clamped tiers `maxDuration: 60`
(`route.ts:8`) may be cut to ~10s at the platform, severing the connection *before* the 55s honest
error — the browser then sees a generic network failure. This is the open half of roadmap item **N6**.
*Fix:* `AbortSignal.timeout(5000)` on the Claude call so a slow model degrades to the regex parser
instead of consuming the budget. Owner: **QUALITY** (engine lib).

### RC3 — (P1) Client fetch has no AbortController / no client-side timeout
`runGeneration` calls `fetch('/api/generate-route', …)` with no `signal` and no client timeout
(`generate/page.tsx:238-242`). If the platform severs the connection (RC2), the `catch` surfaces a raw
`err.message` ("Failed to fetch") (`generate/page.tsx:257-260`) — opaque on mobile. There is also no
way for the rider to cancel a hung request. *Fix:* attach an `AbortController` with a ~58s client
timeout and a friendly message; add a Cancel affordance. Owner: **PLAN**.

### RC4 — (P1) Loading narration freezes after 12s, so the slow path looks hung
`LOADING_STAGES` ends at `at: 12000` ("Scoring and ranking the best options…", `generate/page.tsx:724-730`).
On any request slower than 12s the spinner sits frozen on the last stage for up to the full 55s with no
further feedback. To a mobile user on a slow connection this is "it stopped working." *Fix:* add a
"still working — slow upstream, hang tight" stage after ~15s and a hard "this is taking longer than
usual" state near the timeout. Owner: **PLAN**.

### RC5 — (P2) Auto-run length check is inconsistent with submit check
Homepage handoff auto-runs when `q.length >= 10` **un-trimmed** (`generate/page.tsx:194`), but
`handleSubmit` rejects when `prompt.trim().length < 10` (`generate/page.tsx:219`). A padded short prompt
("  2hr ride  ") can auto-fire generation yet be rejected on manual submit — minor, but a confusing
inconsistency. *Fix:* trim before the length check in the auto-run effect. Owner: **PLAN**.

**Verdict on the CEO report:** most likely **RC1** (the workout decline rendered as a red error) and/or
**RC2/RC4** (slow LLM path with frozen narration and a platform cut-off before the honest 504). None of
these are "the button is missing" — the affordances exist; the failure is *honest-decline-as-error* plus
*unbounded slow-path latency with poor feedback*. All are fixable without architectural change.

---

## PART 2 — Top 10 project-wide risks (file-anchored, P0/P1/P2, owning team)

| # | Risk | File:line | Sev | Pillar |
|---|------|-----------|-----|--------|
| 1 | **Workout/decline path renders as a bare red error**, not a constructive result — primary cause of "isn't working" for workout prompts (RC1). | `generate/page.tsx:423,553-592`; API `api/generate-route/route.ts:200-205` | **P0** | PLAN |
| 2 | **No timeout on the Anthropic LLM call**; slow model never falls back to the regex parser and can consume the entire 55s budget → 504 or platform cut-off (RC2). Open half of roadmap N6. | `route-intent.ts:431-443` | **P0** | QUALITY |
| 3 | **Route detail fetch ignores `res.ok`** and stores the raw `{data}|{error}` envelope into `route`; a 404/500 then flows into render where **`JSON.parse(route.coordinates)` is unguarded** → blank page / thrown render. | `routes/[id]/page.tsx:98-100` and `:275` | **P0** | DISCOVERY |
| 4 | **Client fetch has no AbortController / timeout / cancel**; severed connection surfaces a raw "Failed to fetch" on mobile (RC3). | `generate/page.tsx:238-260` | **P1** | PLAN |
| 5 | **Loading narration freezes at 12s** for the duration of a slow request — slow path looks hung (RC4). | `generate/page.tsx:724-730` | **P1** | PLAN |
| 6 | **`/plan` can only export GPX — a drawn route cannot be saved** to the library; the planner→library loop is a dead end (Phase-1 roadmap item still open). | `MapPlanner.tsx` download-only end action (~`:601-603`) | **P1** | DRAW |
| 7 | **BRouter transient failure returns silent `null` with no retry/backoff** (only the island-detect retry exists); a blip drops candidates with no diagnostic. Public-demo URL still the default if `BROUTER_URL` unset. | `route-generator.ts:302-305` | **P1** | QUALITY |
| 8 | **Route-card & collection-card `<img>` have no width/height/sizes** → layout shift (CLS) and no responsive sizing on the primary discovery surface. | `RouteCard.tsx:74-79`; `CollectionCard.tsx:36-41` | **P1** | DISCOVERY |
| 9 | **Reroute failure on `/plan` shows a generic 503 "routing is busy"** that doesn't distinguish BRouter timeout from no-coverage; rider can't tell why a leg won't snap. | `api/reroute/route.ts:65-71`; client `MapPlanner.tsx:156-201` | **P2** | DRAW |
| 10 | **Elevation profile & surface breakdown collected but never shown in `/plan`** — the "confidence machine" widgets the planning-deconstruction names as table-stakes are unwired; planner is a drawing tool, not a verdict. | `MapPlanner.tsx` (no `ElevationProfile`/`SurfaceSummary` render) | **P2** | DRAW |

**Corrected sub-agent finding (not included above):** the reported "P0 broken map-popup link" at
`MapView.tsx:126` is a **false positive** — line 126 sits inside a backtick template literal
(`marker.bindPopup(\`…\`)`, opened `:120`), so `${route.id}` interpolates correctly. No fix needed.

**Lower-severity items worth a ticket (P2):** silent `.catch(()=>{})` on several discovery fetches
(`HomeClient.tsx:217-235`, `routes/[id]/page.tsx:134-173`) hide upstream failures; derived state in
`MapPlanner.tsx:433-437` recomputed every render without `useMemo`; mobile nav row uses `overflow-x-auto`
(`AppHeader.tsx:160`) so the four links can require a sideways nudge at 375px; `RouteSearchBox` exists but
is never rendered in `HomeClient`.

---

## PART 3 — Cross-cutting engineering-standard notes
- **Build/test/typecheck gates pass today** (190 tests, tsc clean) — but CI (roadmap N4) still does not
  exist, so nothing enforces them on push. The two P0 engine risks (RC2 BRouter/LLM resilience) remain
  **untested** (`route-generator.ts`/`route-quality.ts` failure paths uncovered — roadmap N5).
- **Honesty principle, UX execution gap:** the code declines honestly (good) but presents the decline as
  an error (bad). Risks #1 and #9 are the same shape across PLAN and DRAW — *honest internal state,
  hostile external surface.* This is the single most leveraged fix theme in the product.

---

## Executive summary (for the three build teams)

1. The PLAN feature is **not** missing its submit button or header — both exist and render at 375px.
2. The most likely "isn't working" cause for a **workout** prompt is the honest `NO_WORKOUT_MATCH`
   decline rendered as a bare **red error** with no constructive next step (RC1, P0).
3. The second cause is the **slow path**: no timeout on the Anthropic call means a slow model burns the
   55s budget and can be cut off by the platform before the honest 504 (RC2, P0).
4. The slow path is made worse by **frozen loading narration after 12s** and **no client-side
   abort/cancel** — to the rider it just looks hung (RC4/RC3).
5. DISCOVERY's worst risk is the **route-detail page**: it ignores `res.ok` and then `JSON.parse`s
   coordinates unguarded — a flaky API turns into a blank page (P0).
6. DRAW's worst risk is a **dead-end**: drawn routes can only be exported as GPX, never saved to the
   library; elevation/surface verdicts are collected but never shown.
7. Build gates are green (190 tests, tsc clean) but **no CI enforces them** and the two P0 engine
   resilience paths are untested.
8. One sub-agent "P0 broken map link" was a **false positive** (template literal interpolates fine).
9. The unifying theme is **honest internal state, hostile external surface** — fix the presentation of
   declines and slow paths and most "broken" reports disappear.
10. **Single most urgent fix per pillar:**
    **PLAN** → render the workout/slow-path decline as a constructive result, not a red error
    (`generate/page.tsx:423,553-592`); **DRAW** → let a drawn route save to the library, not GPX-only
    (`MapPlanner.tsx` end actions); **DISCOVERY** → guard the route-detail fetch + `JSON.parse`
    (`routes/[id]/page.tsx:98-100,275`).
