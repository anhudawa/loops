# LOOPS vs Komoot — Competitive Roadmap (research 2026-06-10)

**Context:** Komoot was acquired by Bending Spoons (Mar 2025), laid off ~85%
of staff, and paywalled device sync behind €59.99/yr. Riders are actively
seeking alternatives. Full sources in the research below; summary here.

## Shipped from this research (2026-06-10)
- **Surface % breakdown + "100% paved" badge** on generated candidates
  (their #1 road-cyclist complaint is surprise gravel) — quality scorer now
  reports paved/unpaved/unknown + road-class composition.
- **Discipline-true routing profiles** (road = fastbike-lowtraffic etc.).
- **#4 Wind painting** — previews coloured head/tail/crosswind + wind arrow.
- **#5 Itemised quality factors** — named percentage bars on candidates.
- **#3 (part) Komoot-refugee content** — /blog/komoot-alternative-for-road-cyclists.
- **#7 Café-stop awareness** — parsed, shown, nudges ranking.
- **Session sheet** — plain-language effort placement per candidate.
- Live E2E proof: "90 min road loop, flat, from Skerries, tailwind home
  with a cafe stop" → 35 km, match 97, 93% paved, wind-aligned 80, honest
  SW-16km/h note — all with zero LLM involvement.

## Shipped 2026-06-10 (cont.)
- **#2 Post-generation route editing** — drag via-point pins on a Leaflet
  map, tap to add/remove points, BRouter re-routes with the same
  discipline profiles + guardrails, live stats, GPX download of the edit.
  (RouteEditor.tsx + /api/reroute + rerouteWaypoints; needs an on-device
  browser pass before launch since the sandbox can't render Leaflet.)

## Shipped 2026-06-11
- **#1 Garmin Connect push (code-complete)** — full OAuth 1.0a flow, token
  storage, Courses API push with course points (workout efforts as
  SEGMENT_START/END), Connect/Send/done/error UI on generated candidates.
  Dormant until GARMIN_CONSUMER_KEY/SECRET are set; activation steps +
  required sandbox test: docs/superpowers/plans/garmin-connect-setup.md.

## Do next (priority order)
1. **Garmin activation** — owner applies for the Training API (see setup
   doc); then one sandbox push test on a real Edge before launch. Wahoo
   Cloud API next (OAuth2, same component pattern).
2. **Route editor polish** — undo, save-edited-route to library, re-score
   quality on save, workout-route editing (anchored efforts pinned).
3. **Komoot-refugee funnel** — bulk GPX/RWGPS import UI (parsers exist) +
   SEO pages: "Komoot alternative for road cyclists", per-destination pages.
   Catch users mid-exodus; cheapest acquisition we will ever get.
4. **Wind painting on the map** — colour the polyline head/tail/crosswind for
   the start time (myWindsock-style); wind.ts already computes everything.
5. **Itemised quality factors on route pages** — show the 10-factor breakdown
   (quiet %, surface, traffic) instead of one opaque number.
6. **Climb cards → course points** — feed detected climbs into GPX/Garmin
   push so climbs alert mid-ride.
7. **Café stop in generation** — "with a café around halfway" honoured by the
   parser + Overpass amenities surfaced along routes.
8. **/pricing trust page** — commit in writing: GPX + device sync free
   forever, no region locks (owner decision needed on the actual model).
9. **Photo-first destination collections** + "import all 8 to your Garmin".
10. **Offline route sheet (PWA)** — cache active route tiles/profile/cafés.

## Explicitly NOT doing
- Strava-style heatmap (no corpus; fake one violates honesty principles —
  the operator-sourced library IS our "locals ride this" signal).
- Turn-by-turn nav / native apps (head units do it better; PWA first).
- Social at launch.
