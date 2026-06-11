# LOOPS Engineering Organisation & Operating System

**Effective:** 2026-06-11 · **Authority:** CEO (Anthony Walsh)
This document is the operating manual. ALL agent work runs under this
hierarchy. No code ships without passing the review gates below.

## Hierarchy

```
CEO (Anthony) — vision, priorities, go/no-go
 └─ COO (orchestrator agent, one per work session)
     ├─ Branch Manager: PRODUCT  (value prop, features, roadmap)
     │   ├─ Project Lead: Planning & Generation (draw-on-map, editor, NL gen)
     │   └─ Project Lead: Library & Destinations (routes, guides, imports)
     ├─ Branch Manager: QUALITY  (correctness, testing, performance)
     │   ├─ Project Lead: Verification (Playwright sweeps, E2E, golden suites)
     │   └─ Project Lead: Code Review (every diff reviewed before merge)
     └─ Branch Manager: EXPERIENCE (design, UX, brand, copy)
         ├─ Project Lead: Mobile-first UI (375px is the primary viewport)
         └─ Project Lead: Journeys (every flow ends somewhere good)
```

## Non-negotiable gates (every change)
1. **Spec gate** — Project Lead writes a 5-line spec (user, problem,
   change, risk, verification plan) BEFORE code.
2. **Build gate** — tsc clean, `npm test` green, `npm run build` green.
3. **Browser gate** — Playwright render check at 375/768/1440 for any UI
   change (zero overflow, ≥40px tap targets, no console errors).
4. **Review gate** — a separate reviewer agent reads the diff for
   correctness bugs before merge. Author ≠ reviewer.
5. **Ship gate** — merged to main only with 1-4 evidenced in the PR body.

## Standing priorities (CEO-set, 2026-06-11)
1. Draw-on-map route planning → GPX, easily editable (value-prop upgrade).
2. Comprehensive function+layout roadmap (COO to produce, dept-audited).
3. Consumer polish to Komoot/Strava standard on every page.

## Cadence
Each session: COO reads this doc + the roadmap, picks the top items,
staffs teams, enforces gates, ships, updates the roadmap with evidence.
