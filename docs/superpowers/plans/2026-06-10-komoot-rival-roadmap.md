# LOOPS vs Komoot — Competitive Roadmap (research 2026-06-10)

**Context:** Komoot was acquired by Bending Spoons (Mar 2025), laid off ~85%
of staff, and paywalled device sync behind €59.99/yr. Riders are actively
seeking alternatives. Full sources in the research below; summary here.

## Shipped from this research (2026-06-10)
- **Surface % breakdown + "100% paved" badge** on generated candidates
  (their #1 road-cyclist complaint is surprise gravel) — quality scorer now
  reports paved/unpaved/unknown + road-class composition.
- **Discipline-true routing profiles** (road = fastbike-lowtraffic etc.).

## Do next (priority order)
1. **Garmin Connect / Wahoo / Hammerhead push** — the exact feature Komoot
   paywalled; our course-point workout alerts depend on a real course push.
   Long pole is API programme approval (owner action), code is plain OAuth+REST.
2. **Post-generation route editing** — drag via-points on the Leaflet map,
   BRouter re-routes between anchors, score updates live. Converts "toy" to
   "tool"; de-risks generator mistakes. Largest item.
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
