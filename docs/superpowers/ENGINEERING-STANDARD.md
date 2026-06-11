# LOOPS Engineering Standard

The bar for this build. CI (`.github/workflows/ci.yml`) enforces the hard
gates on every PR and push to `main`; the rest is the team's discipline,
recorded so it's auditable.

## Hard gates (CI-enforced, required to merge)
1. **Typecheck** — `tsc --noEmit` clean. No `ignoreBuildErrors`.
2. **Unit tests** — `vitest run` green. 190 tests today; coverage grows
   with every feature (no merging logic without a test).
3. **Production build** — `next build` green, all pages. App builds
   without a database (fail-soft render) — verified, no secrets needed.

## Process gates (ORG.md, human/agent-enforced)
4. **Spec before code** — 5-line spec (user, problem, change, risk,
   verification).
5. **Browser gate** — render check at 375/768/1440 for UI changes.
6. **Independent review** — author ≠ reviewer; diff read for correctness
   before merge.
7. **PR-only to main** — every change merges via PR with gate evidence in
   the body. No direct pushes to `main`.

## Required repo settings (owner action, one-time)
- Branch protection on `main`: require the **CI / verify** check to pass,
  require a PR, disallow direct pushes. (GitHub → Settings → Branches.)

## Tracked engineering debt (not blocking, scheduled)
- **Lint**: ~30 errors, almost all satori-JSX false-positives in
  `src/app/api/og/*` (non-DOM props the React linter rejects). Fix by
  scoping the DOM-prop rules off the OG routes + clearing the handful of
  real unused-var / unescaped-entity warnings. Then make lint a hard gate.
- **Rotate the leaked DB credential** (Neon dashboard) — still extractable
  from git history; the single highest-priority owner action.
- Coverage gaps: route-rules.ts, route-quality.ts, route-generator.ts have
  growing but incomplete unit coverage of failure paths.

## Definition of done (every feature)
Spec written · types clean · tests added & green · builds · reviewed ·
renders at 3 viewports · merged via PR with evidence · roadmap updated.
