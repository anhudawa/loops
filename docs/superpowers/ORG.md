# LOOPS Engineering Organisation & Operating System

**Effective:** 2026-06-11 · **Authority:** CEO (Anthony Walsh)
This document is the operating manual. ALL agent work runs under this
hierarchy. No code ships without passing the review gates below.

## Hierarchy

```
CEO (Anthony) — vision, priorities, go/no-go
 └─ COO (orchestrator agent, one per work session)
     ├─ PILLAR TEAM: PLAN     — natural-language + voice generation (/generate)
     │     owns: generate page, route-intent, route-generator UX surface
     ├─ PILLAR TEAM: DRAW     — map route planner (/plan)
     │     owns: MapPlanner, plan-legs, /plan pages, /api/reroute UX
     ├─ PILLAR TEAM: DISCOVERY — find a route (/ home, search, browse, routes/[id])
     │     owns: HomeClient, RouteCard, search, route detail, collections
     ├─ Branch Manager: QUALITY  — correctness, testing, performance, CI
     │     reviews every pillar's PR (author ≠ reviewer); owns the engine libs
     └─ Branch Manager: EXPERIENCE — shared design system, AppHeader, brand
           owns: AppHeader, globals.css tokens, cross-page consistency
```

### The three pillars (CEO, 2026-06-11)
The product is THREE ways to answer "Where should I ride today?":
**PLAN** (ask for it), **DRAW** (sketch it), **DISCOVERY** (find one near you).
Each is a standing team with its own feature branch and PR. Shared
surfaces (AppHeader, design tokens, the generation engine) are owned by
Quality/Experience — pillar teams request changes, never fork them.

### Branching (world-class flow)
Each team works on `feat/<pillar>-<topic>` off the integration branch,
opens a PR, passes CI (required check), gets an independent review, and
merges. No team commits directly to another team's owned files.

### Worktree isolation (MANDATORY — learned 2026-06-11)
Parallel pillar teams MUST each run in their own `git worktree`
(`git worktree add ../loops-<pillar> feat/<pillar>-<topic>`). On
2026-06-11 three teams shared one checkout with a live `next dev`; the
dev server and concurrent `git checkout` repeatedly reverted edits and
switched branches under running agents. They recovered (commits are
durable; cherry-pick + force-with-lease), but it cost real time. One
worktree per team eliminates the race. The COO sets these up before
staffing parallel teams.

## Non-negotiable gates (every change)
1. **Spec gate** — Project Lead writes a 5-line spec (user, problem,
   change, risk, verification plan) BEFORE code.
2. **Build gate** — tsc clean, `npm test` green, `npm run build` green.
3. **Browser gate** — Playwright render check at 375/768/1440 for any UI
   change (zero overflow, ≥40px tap targets, no console errors).
4. **Review gate** — a separate reviewer agent reads the diff for
   correctness bugs before merge. Author ≠ reviewer.
5. **Ship gate** — merged to main only with 1-4 evidenced in the PR body.

## North star (CEO-set, 2026-06-11)
The product answers ONE question: **"Where should I ride today?"**
Every page, every layout decision, every CTA is judged against how
directly it answers that question. Anything that doesn't serve it is
secondary or cut.

## Standing priorities (CEO-set, 2026-06-11)
1. Draw-on-map route planning → GPX, easily editable (value-prop upgrade).
2. Comprehensive function+layout roadmap (COO to produce, dept-audited).
3. Consumer polish to Komoot/Strava standard on every page.

## Cadence
Each session: COO reads this doc + the roadmap, picks the top items,
staffs teams, enforces gates, ships, updates the roadmap with evidence.
