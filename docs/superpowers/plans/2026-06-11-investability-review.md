# LOOPS — Investability Review (Board Memo)

**Question (CEO):** Standing shoulder to shoulder with Strava and Komoot,
would LOOPS hold its own? Would a VC invest in us over them? If not, why —
and how do we bridge the gap?

**Date:** 2026-06-11 · **Author:** COO synthesis · **Tone:** no flattery.

---

## 1. The blunt verdict

**No — a VC would not fund LOOPS *over* Strava or Komoot today, and that is
the wrong frame.** No investor funds a head-on "better Strava"; that war is
lost on distribution before code is written. Strava has ~150M registered
users, the segments/social network effect, and a decade of ride data that
cannot be bought or cloned. Komoot was acquired by Bending Spoons (2025).
LOOPS today is **pre-launch: zero users, zero retention data, no native
app, no social graph, a leaked DB credential still in git history, and a
generation pipeline that depends on rate-limited public services.** On the
only things a seed VC underwrites — traction, retention, CAC, defensibility
— we currently have **nothing measured.** The honest grade as an investment
*today* is: not yet investable.

But "would they fund us over Strava" is not the bet on the table. The real
question is whether there is a **wedge** — and there is a plausible one.

## 2. Where we genuinely hold our own (code-grounded)

- **We answer a question; they make you do work.** Strava/Komoot give you a
  *route builder*. LOOPS answers "where should I ride today?" in one
  sentence — NL+voice → a scored loop (`src/lib/route-intent.ts`,
  `route-generator.ts`). That is a genuinely different product posture, not
  a feature reskin.
- **Wind-aware routing** (`src/lib/wind.ts`) — "tailwind home" oriented to
  the forecast for the hour you'll actually be on each leg. Standalone apps
  (myWindsock) exist *only* because no mainstream planner does this.
- **Workout-corridor assembly** (`src/lib/session-assembly.ts`) — finds a
  junction-free stretch that can hold a 2×20 and builds the loop around it,
  with course-point alerts. Neither incumbent does engineered intervals.
- **Honesty as design** — declines rather than serving an unverified route
  (`route-quality.ts` floor; Overpass-down → honest decline). Incumbents
  can't adopt this without admitting their routes are often wrong.
- **Draw-to-snap planner** at Strava-grade incremental snapping + live
  elevation + mid-leg insertion + save (`MapPlanner.tsx`, shipped today).
- **Engineering discipline now real** — CI gates, 199 tests, PR-only flow.
  Not a moat, but it means the team can ship reliably.

## 3. Where we'd get destroyed

- **Distribution.** They have hundreds of millions of installs; we have a
  domain. This is the single biggest gap and it is not closed by features.
- **Network effects / data flywheel.** Every Strava ride improves their
  heatmap and segments. Our product does **not compound with use** today —
  a generated route doesn't make the next one better. This is the deepest
  structural weakness. We explicitly *cannot* license Strava's heatmap.
- **Trust & brand.** A serious cyclist won't stake a training day on an app
  with no reviews, no track record, no community. Zero social proof.
- **No native app / no offline.** PWA only. Incumbents own the home screen.
- **Capital & team.** They're funded with large teams; we are effectively
  one founder + an agent org. We cannot win a feature-parity race.
- **A route planner is a feature, not a company** — until it becomes the
  wedge into something retentive and defensible.

## 4. The honest reframe — is there a venture thesis?

A seed VC does not bet on parity. They bet on a **wedge into a market the
incumbent is structurally vacating**, with a path to a moat. The plausible
thesis for LOOPS:

> **"The training-intelligence layer for serious cyclists, entered through
> the Komoot-refugee moment."** Komoot just paywalled device sync and gutted
> its team — there is a live, angry, high-intent churn market *with a clock
> on it.* LOOPS wins the narrow segment that Strava/Komoot serve worst:
> riders who train with structure and care where the road actually goes.
> Land them with the one-sentence answer + free device sync (the thing
> Komoot paywalled), then build the data flywheel from *their* completed
> rides and condition reports — the moat we don't have yet.

That is investable *if proven*. The bet a VC would actually make is not "is
the tech good" (it is fine) — it is **"can this team convert the refugee
moment into retained, structured-training users who come back weekly, and
does usage start to compound."**

## 5. The gap-bridge plan (sequenced, to fundability)

Fundability is not more features. It is **evidence, a flywheel, and a
landed wedge.** In order:

1. **EVIDENCE (go-to-market + measure).** Get 50–100 real serious cyclists
   (NDY/Clubhouse, the spec's own beta panel) using it weekly; instrument
   retention (W1/W4), routes ridden, "would you tell a clubmate" NPS. *One
   slide of real retention beats any feature list.* Nothing else matters
   until this exists.
2. **THE FREE-SYNC WEDGE (build + GTM).** Activate Garmin Connect push
   (code-complete, needs the API approval already in motion) and shout
   "device sync free forever" at the Komoot-refugee market. This is the
   single sharpest, time-boxed acquisition lever we have.
3. **THE DATA FLYWHEEL (data play).** Make usage compound: completed-ride
   feedback + condition reports + which generated routes get ridden/saved
   feed back into scoring and a *private* "locals ride this" signal over
   our destinations. This is the only thing that turns a feature into a
   moat. Without it there is no venture case.
4. **RETENTION LOOP (build).** A reason to open it weekly beyond a one-off
   route: "your Tuesday threshold session, wind-planned for today" — the
   structured-training rider's habit. Tie to their calendar/intervals.icu.
5. **TRUST (GTM + product).** Real ratings/condition reports on real routes
   from the beta panel; named local-source provenance shown tastefully;
   the honesty positioning made loud.
6. **DEFENSIBLE SCOPE (focus).** Don't fight Strava on social or Komoot on
   global coverage. Own "serious training rides in N destinations + your
   home patch" deeply. A small, retained, fanatical wedge is fundable; a
   broad shallow one is not.
7. **DE-RISK THE STACK (build).** Self-hosted BRouter + an OSM/PostGIS
   road-intelligence layer (sub-12s generation; today it's 30–60s on
   public services) so the core experience is fast and owned, not rented.

## 6. Kill-criteria (what would prove this ISN'T venture-scale)

Honest tripwires — if these hold after a real beta, this is a good *product*
but not a *venture*:

- Beta W4 retention < ~20% among serious cyclists who tried it.
- The free-sync wedge doesn't convert refugees (low signup→active from the
  Komoot-churn campaign).
- Usage doesn't compound — route N+1 is no better for having ridden N;
  no data advantage accrues.
- Generation can't get reliably under ~15s / can't be made to "just work"
  on the roads people actually ride (quality complaints from the panel).
- The only people who love it are us.

If 3+ of these hold, the right answer is a great indie product / lifestyle
business or an acqui-hire angle — not a venture raise. That is a fine
outcome to know early.

---

## 7. VC-lens evidence (sourced)

The market analyst's hard data, which hardens every point above:

- **The category winner is itself modest.** Strava ≈ $415–500M revenue at
  ~180M registered users (2025); valued ~$2.2B (Sequoia, 2025), IPO filed
  ~$3B → ~5–7× revenue. That is the *ceiling* of this space, and it required
  the social/data moat we've deliberately not built.
- **The route-planning specialist's actual outcome:** Komoot — the best pure
  planner in the world — sold to Bending Spoons (~€290–300M, Mar 2025),
  ~80–85% of staff (~150 people) laid off within ~2 weeks, device sync
  paywalled. *Being better at routing than everyone is what preceded the
  gutting, not what created durable value.* That is the honest ceiling for a
  routing specialist.
- **The realistic base case is RideWithGPS:** 16 years old, cash-flow
  positive from day one, first outside money ($3M) only in 2023, ~$5.6M
  revenue. A good business; not a venture rocket.
- **TAM is a sub-segment of a sub-segment.** The whole fitness-app *software*
  market is ~$13B; cycling route planning is a slice of a slice. "Serious
  cyclists" maximises intent but *minimises* scale — realistic 1–3yr SOM is
  low-thousands to low-tens-of-thousands of subs (~$1–5M ARR ceiling), below
  the fund-returning bar.
- **Fitness VC has tapped out** of connected-fitness (~$5B cyclical low);
  the capital that flows goes to AI-native coaching / clinical / wearables
  (Oura $900M, Strava buying Runna for AI coaching). The only fundable
  reframe is *agentic AI coach that owns the training relationship* — a
  harder, more capital-intensive build, racing the incumbent that just
  bought exactly that.
- **The most fundable non-consumer shape:** B2B2C — license the
  route-intelligence engine to cycling-tourism operators, camps, hotels,
  rental fleets in the destinations (the operator-library work is already
  adjacent). A services/SaaS play, not a venture rocket, but defensible and
  cash-generative.

Sources: Business of Apps (Strava); BusinessWire / DC Rainmaker / Escape
Collective (Komoot acquisition); GeekWire / PitchBook (RideWithGPS); Grand
View / Polaris (fitness-app TAM); RevenueCat State of Subscription Apps 2025
(retention/CAC benchmarks); Crunchbase News (fitness VC pullback);
the5krunner (Strava IPO filing).

## 8. Product-lens reality check (code-grounded)

Feature-by-feature against both incumbents, tied to actual code:

| Capability | Verdict |
|---|---|
| Wind-aware loop orientation (`wind.ts`) | **WIN, real & defensible** — neither incumbent has it; self-contained |
| NL + voice generation (`route-intent.ts`) | **WIN but thin** — LLM-to-params shim; voice is the free browser API (no Firefox) |
| Structured-workout placement (`session-assembly.ts`) | **Impressive demo, not yet a win** — riskiest code; multi-hop external calls; verified one location |
| Honest quality scoring (`route-quality.ts`) | **WIN in philosophy** — well-coded; unproven that users *feel* it without ride data |
| Draw/snap planning (`MapPlanner.tsx`) | **TIE** — genuine parity incl. mid-leg reshape |
| GPX export | TIE (floor) |
| Discovery/search | **LOSE** — `ILIKE` over ~100-300 seeded routes vs global DBs |
| Social / segments / leaderboards | **DESTROYED** — none exist; this is Strava's entire moat |
| Heatmap / popularity | **DESTROYED** — none; structurally blocked by zero users |
| Native app / offline / turn-by-turn | **DESTROYED** — see correction below |
| Live Garmin/Wahoo sync | **LOSE** — Garmin dormant/uncredentialed/untested; Wahoo absent |

**Two things we must STOP over-claiming (the analyst caught these):**
- **"Native app / Capacitor mobile bridge" is a webview wrapper** pointing
  at `gravel-ireland.vercel.app` — there is no `ios/`/`android/` build. We
  do not have a mobile app. Stop saying we do.
- **"One-tap Send to Garmin" is dormant code** — `isGarminEnabled()` is
  false without keys, never exercised against Garmin's sandbox. It is a
  *promise*, not a shipped feature. Represent it as such until the API
  approval lands and it's tested on a device.

**Three confirmed P0s that actively damage credibility (fix immediately):**
1. **The honest decline renders as a red error.** Our signature feature —
   saying "no, I won't serve you a compromised session" — is painted in the
   system-failure red box (`generate/page.tsx`), so the one moment that
   *proves* the honesty positioning looks like a crash. Self-sabotage.
2. **Route-detail page crashes on malformed coordinates** — unguarded
   `JSON.parse` in the render path (`routes/[id]/page.tsx`).
3. **No timeout on the Anthropic call** (`route-intent.ts`) — a slow model
   burns the whole 55s budget before the deterministic fallback can run;
   the user's "it isn't working" experience.

These three are now the top of the credibility bucket in the bridge plan —
a product that wants to win on *honesty* cannot have its honest "no" look
like a bug.

## Executive summary (for the CEO)

1. Funded *over* Strava/Komoot today? **No.** Wrong question — nobody funds
   head-on parity; distribution is already lost.
2. We are pre-launch with zero users, zero retention, no app, no flywheel —
   the metrics VCs underwrite don't exist yet.
3. The tech is genuinely good and differentiated (NL+wind+workout+honesty);
   "good tech" is table stakes, not the bet.
4. Our deepest weakness is structural: **usage doesn't compound** — no data
   moat. Fix that or there's no venture case.
5. The real thesis: training-intelligence wedge, entered through the
   **Komoot-refugee moment** (live, time-boxed, high-intent).
6. The sharpest lever we own: **free Garmin/device sync** — the exact thing
   Komoot just paywalled. Activate and shout it.
7. Fundability = **evidence + flywheel + landed wedge**, not more features.
8. Step 1 is non-negotiable: 50–100 weekly beta riders with measured
   retention. One real retention curve > any roadmap.
9. Build the data flywheel (completed rides, condition reports → scoring +
   private local signal) — the only path to a moat.
10. Own a narrow fanatical segment deeply; don't chase parity.
11. Self-host the routing stack to make the core fast and owned.
12. Know the kill-criteria; if a real beta misses them, this is a great
    product, not a venture — and that's worth knowing early.
