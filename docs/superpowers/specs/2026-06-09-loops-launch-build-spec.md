# LOOPS.IE — LAUNCH BUILD SPEC

**Prepared for:** Development team
**Owner:** Anthony Walsh, Roadman Cycling
**Status:** Build brief for consumer launch
**Date:** June 2026

> Record copy of the brief as received. The dev team response (gap analysis,
> timeline, sequencing, resourcing, spike plan) is at
> `docs/superpowers/plans/2026-06-09-loops-launch-delivery-plan.md`.

-----

## What we're building

Loops is a route intelligence product for serious cyclists. It does three things, and it does them at a quality level where a rider would stake a training day on the output:

1. **Curated destination libraries** — locally validated route sets for 10 iconic cycling destinations
2. **Voice-prompted route generation** — "find me a 3-hour loop on quiet roads, flat, tailwind home" → a world-class route, not an approximation
3. **Session-aware loop building** — give it a structured workout, get a loop engineered around the intervals, with the effort segments marked on the map

The quality bar is absolute. A rider who gets one bad route — a gravel sector on a road bike, a motorway sliproad, a 20-minute effort interrupted by three junctions — never opens the app again and tells their club WhatsApp group about it. Every product decision below flows from that.

**Existing stack context:** We run Next.js 15 App Router, Supabase (Postgres + pgvector), Vercel, and the Anthropic API across Roadman properties. Loops should use the same stack unless there's a hard technical reason not to. Routing engine is the one new core dependency — see Section 5.

-----

## Launch strategy (read this before scoping)

Do not launch open-world generation on day one. The failure mode of every route generator on the market (Komoot round-trips, Strava route builder, RideWithGPS auto-routing) is that they're 80% good, and 80% good is a churn machine for our audience.

Instead:

- **Phase 1 (launch):** Curated libraries for all 10 destinations + voice and session generation **constrained to those 10 destinations only**, where we have validated road intelligence and every generated route can be checked against ground truth.
- **Phase 2 (post-launch):** Open generation anywhere, gated by the quality scoring system once it's proven in the controlled geographies.

This means at launch, every road a generated route can touch has been classified by us, and a meaningful share of generated outputs will overlap with locally validated segments. Quality is engineered in, not hoped for.

-----

## 1. Curated Destination Libraries

### Destinations (proposed — Anthony to confirm final 10)

Mallorca, Girona, Tenerife, Calpe/Costa Blanca, Nice/Côte d'Azur, Lucca/Tuscany, Lake Garda, Annecy, Dublin/Wicklow, Flanders (Oudenaarde).

Rationale: these cover the training-camp circuit our audience actually books, plus home turf, plus one cobbled-classics destination. Each needs 8–12 routes spanning: recovery spin (1–1.5hr), standard loop (2–3hr), big day (4–5hr+), and at least one signature climb route where relevant.

### Local validation — this is the moat

Every GPX in the library must carry sign-off from a named local source: a bike shop, tour operator, guiding company, or resident coach. Example partner type: Eat Sleep Cycle in Girona. The validation is not a rubber stamp — the validator confirms:

- Surface condition is currently as described (resurfacing, deterioration, gravel sectors)
- No active road closures or works on the route
- Traffic character matches the rating (a road that was quiet in 2022 may not be now)
- Café/water stops listed are open and rider-friendly
- Descents flagged as technical are flagged
- The route is one a local would actually recommend, not just one that's rideable

### Data model

```
destinations:      id, name, slug, country, hero_copy, validator_partner_id, bounds_geojson
validator_partners: id, name, type, contact, destination_id, agreement_status
routes:            id, destination_id, name, distance_km, elevation_m, est_time_by_level,
                   difficulty, surface_profile, traffic_rating, gpx_url, polyline,
                   description, cafe_stops_json, hazards_json, signature_climbs_json,
                   validated_by, validated_at, revalidation_due, version, status
route_validations: id, route_id, validator_id, checklist_json, notes, signed_off_at
```

### Validation workflow (build the admin tool)

1. Route drafted internally or submitted by partner → status `draft`
2. Validator receives a checklist link (mobile-friendly, no login friction) → completes the checklist above → status `validated`
3. Every route carries `revalidation_due` — default 6 months, 3 months for destinations with heavy seasonal roadworks (Mallorca pre-season)
4. Expired validation drops the route to `needs_review` and surfaces a badge change in the UI ("Last verified: March 2026"). Never silently serve a stale route as current.
5. All edits create a new version. GPX files are immutable per version.

### Acceptance criteria

- All 10 destinations live with minimum 8 validated routes each at launch
- Every route page shows: validator name/logo, validation date, surface profile bar, traffic rating, elevation profile, café stops, hazard notes
- GPX export verified working on Garmin (Edge 540/840/1050), Wahoo (ROAM/BOLT), Hammerhead Karoo — actual device testing, not just file-format validation
- Routes render correctly with full elevation profile in under 1.5s on 4G

-----

## 2. Voice-Prompted Route Generation

### The interaction

Rider taps the mic, speaks naturally: *"Find me a three hour loop on quiet roads with little elevation. Tailwind on the way home."* The app confirms its interpretation in one line ("3hr loop · quiet roads · flat · wind-optimised for your return leg · starting from current location — sound right?"), rider confirms or corrects by voice, route generates.

### Pipeline

```
Speech → text:        Browser SpeechRecognition API with Whisper fallback
                      (server-side, for accents/wind noise — our audience rides outdoors)
Text → constraints:   Claude API call parsing to a strict JSON schema (below)
Constraints → route:  Candidate generation + scoring (Section 5)
Route → rider:        Map preview, plain-language route summary, confidence indicators
```

### Constraint schema (the contract between NLU and routing)

```json
{
  "duration_target_min": 180,
  "duration_tolerance_min": 15,
  "distance_target_km": null,
  "start_point": "current_location | named_place | saved_location",
  "loop": true,
  "traffic_preference": "quiet | normal | any",
  "elevation_preference": "flat | rolling | hilly | max_climbing",
  "elevation_cap_m": null,
  "surface": "road | gravel | mixed",
  "wind_strategy": "tailwind_home | tailwind_out | headwind_out | none",
  "must_include": [],
  "must_avoid": [],
  "cafe_stop": null,
  "rider_speed_kmh": "from_profile_or_default_by_level"
}
```

Duration → distance conversion uses the rider's speed profile (set in onboarding: level + typical solo pace, refined over time from completed rides if they connect Strava). Never assume 30km/h for everyone — a 3-hour loop for Plateau Tom and a 3-hour loop for a returning rider are 30km apart.

### Wind handling — get this exactly right or don't ship it

- Pull forecast wind direction/speed for the ride window from Open-Meteo (free, reliable) at route-generation time, sampled at 3+ points along candidate routes, not just the start point
- "Tailwind home" means: orient the loop so the return half's bearing distribution aligns with forecast wind direction for the *time the rider will actually be on the return leg* (departure time + half of duration), not the wind right now
- Show the rider what we did: a small wind arrow on the map and a line in the summary — "Wind SW 18km/h this afternoon — you'll ride into it for the first 40km and have it at your back from the turn at Skerries"
- If wind is under 8km/h or forecast confidence is low, say so and don't pretend the optimisation matters

### Acceptance criteria

- Parse accuracy: 95%+ on a 200-utterance test set covering Irish, British, American, Australian accents and realistic phrasing variation, including corrections ("actually make it two hours")
- End-to-end generation in under 12 seconds, with progressive UI (constraint confirmation appears in <2s)
- Every generated route passes the hard guardrails in Section 5 — zero exceptions
- Rider can regenerate with one tap ("show me another") and refine by voice without restarting

-----

## 3. Session-Aware Loop Building

### The interaction

Rider describes the workout: *"I've a 2-hour zone 2 ride with 2 x 20-minute zone 4 efforts."* Or imports it (Phase 2: TrainingPeaks/Vekta/intervals.icu sync — at launch, voice/text entry only).

The output is a loop where the interval segments are **engineered, not overlaid**: each 20-minute effort is mapped to a continuous stretch of road that can actually hold the effort.

### What makes a valid interval segment

This is the hardest and most differentiated part of the product. An interval segment must satisfy:

- **Continuous duration at effort speed:** segment length ≥ (interval duration × rider's zone-4 speed), with zone speeds derived from rider profile (FTP or level-based defaults)
- **Junction density:** no more than 1 minor junction per 10 minutes of effort; zero traffic lights, stop signs, or yield-onto-major-road points
- **Gradient discipline:** for flat efforts, gradient stays within −1% to +3%; never a descent mid-effort that forces freewheeling. If the rider asks for climbing efforts, invert this.
- **Surface and traffic:** best-available road class on the route; never place an effort on the route's worst road
- **Safety:** no efforts through villages, school zones, or technical descents

### Route assembly logic

Anchor-first, not route-first: find qualifying interval segments within range of the start point, then build the loop *around* them, placing warm-up before the first effort (minimum 15 minutes riding before effort 1), recovery spacing between efforts per the session structure, and cool-down to close the loop. If no qualifying segments exist within range, **say so** — "I can't find a clean 20-minute stretch within reach of your start point; here's the best option with one junction at minute 14, or I can split it into 2 x 10s" — never silently serve a compromised segment.

### Presentation

- Map shows the loop with interval segments colour-coded (zone colours), labelled "Effort 1 — start here, 21 min at your Z4 pace, ends at the Garristown crossroads"
- Elevation profile shows effort zones shaded
- GPX export includes the efforts as course points so they appear as alerts on Garmin/Wahoo head units — test this on-device; course point behaviour differs by manufacturer
- Plain-language session sheet: where each effort starts, what to look for, where recovery spins happen

### Acceptance criteria

- For the 10 launch destinations plus a 50km radius around Dublin, the system finds valid interval placements for the standard session library (2x20, 3x10, 4x8, 5x5, over/unders, sweet spot 2x30) from any start point, or explicitly declines with alternatives
- On-device verification that course-point alerts fire at effort start/end on Garmin and Wahoo
- A panel of real riders (NDY members — we will recruit them) rides 20 generated sessions and rates interval segment quality; minimum 9/10 average on "I could do the full effort uninterrupted"

-----

## 4. Routing Engine & Road Intelligence

### Engine

GraphHopper (self-hosted) is the recommendation: open source, supports custom routing profiles via custom models (weight road classes, surfaces, gradients), and has a round-trip algorithm to use as a candidate generator. Valhalla is the fallback option. Do a one-week spike comparing both on Irish and Mallorcan road networks before committing.

OSM is the base map data. Build a **road intelligence layer** on top of it in Postgres/PostGIS:

```
road_segments: osm_way_id, geom, road_class, surface, surface_confidence,
               traffic_score, junction_density, gradient_profile,
               quietness_score, source (osm | validator | community | manual),
               last_verified
```

For the 10 launch destinations, this layer is seeded three ways: OSM attributes, validator partner input (they mark the roads locals avoid), and manual review of every road class above tertiary within the destination bounds. This is real work — budget it. It's also exactly why constrained launch geography is the right call.

Note on Strava heatmap data: it is not licensable for this use. Don't build anything that depends on it. Community ride data from our own users becomes the equivalent signal over time.

### Generation = candidates + scoring, never a single shot

1. Generate 15–30 candidate loops (round-trip algorithm with varied headings/seeds, plus templated loops through known-good corridors)
2. Score every candidate against: quietness, surface quality, elevation match, wind alignment, junction density, scenic/known-good segment overlap, duration accuracy
3. **Hard guardrails (auto-reject, never surface):** motorways and sliproads, roads tagged `access=no/private`, unpaved on a road-bike request, ferries unless requested, single-segment out-and-backs sold as loops, any road our intelligence layer marks `avoid`
4. Serve the top candidate; "show me another" serves the next-ranked, not a regeneration

Log every generated route, its score breakdown, and the rider's action (accepted / regenerated / abandoned / exported / ridden). This corpus is how the scorer improves.

-----

## 5. UX/UI

Read the Roadman brand guidelines before designing anything (dark charcoal/deep purple base, coral #F16363 accent, Bebas Neue headers, Work Sans body). Loops should feel like a precision instrument, not a social network.

Non-negotiables:

- **Mobile-first.** This gets used standing next to a bike in a hotel lobby in Alcúdia. Every core flow must complete one-handed.
- Three-tap maximum from open to a route on screen for curated; voice flow is mic-tap → speak → confirm → route
- Route preview answers the rider's real questions without scrolling: distance, time at *their* pace, climbing, surface, traffic character, wind note, validation badge
- Export to Garmin Connect, Wahoo, and raw GPX from every route — the head-unit handoff is the moment of truth, make it frictionless (direct Garmin Connect API integration at launch, not "download a file and figure it out")
- Honest empty/failure states. "I couldn't build a route I'd stand over with those constraints — here's why and here's what I'd change" beats serving rubbish. This is a product principle, not just error copy.
- Loading states show what's happening ("checking wind forecast… scoring 24 candidate loops…") — perceived quality is quality

-----

## 6. Testing & Launch Gate

The product does not launch until all of the following pass:

**Golden route test set.** 100 prompt → expected-properties pairs across the 10 destinations (mix of voice and session requests). Run on every build. Any guardrail violation is a release blocker.

**Real-rider validation.** Minimum 25 riders (recruited from NDY and Clubhouse) ride generated routes in at least 4 destinations and rate them. Launch gate: average 9/10, zero ratings below 7 caused by route quality (weather doesn't count), and 100% successful head-unit exports.

**Device matrix.** iOS Safari (15 Pro and one older device), Android Chrome (Pixel + Samsung), tablet. Voice tested with road noise and wind. GPX/course-point behaviour verified on Garmin Edge 540/840/1050, Wahoo ROAM/BOLT, Karoo.

**Performance.** Route generation p95 under 12s, curated route page p95 under 1.5s on 4G, map interaction at 60fps on a 3-year-old phone.

**Resilience.** Wind API down → generate without wind optimisation and say so. Routing engine timeout → graceful retry with honest messaging. Voice parse failure → fall back to a structured form pre-filled with whatever was understood.

**Legal/liability.** Routes carry an appropriate "ride at your own risk, conditions change" disclaimer reviewed by our solicitor. Validator agreements define their responsibility scope. Hazard notes are surfaced, never buried.

-----

## 7. What's explicitly out of scope for launch

Social features, route comments/ratings from the public, open-world generation outside the 10 destinations, TrainingPeaks/Vekta sync (Phase 2), turn-by-turn in-app navigation (head units do this better — we hand off), iOS/Android native apps (PWA first).

-----

## 8. Deliverables checklist for the dev team

1. Spike report: GraphHopper vs Valhalla on Irish + Mallorcan networks (week 1)
2. Road intelligence schema + seeding tooling + validator admin tool
3. Curated library: data model, route pages, GPX/Garmin/Wahoo export
4. Voice pipeline: speech capture, Claude constraint parser, confirmation UX, 200-utterance test harness
5. Generation engine: candidate generator, scorer, guardrails, logging
6. Session engine: interval segment finder, anchor-first assembly, course-point export
7. Golden route test suite wired into CI
8. Rider beta programme tooling (route assignment, rating capture)
9. Launch gate report against Section 6

Timeline, sequencing, and resourcing estimates back to Anthony within one week of receiving this brief, with the GraphHopper/Valhalla spike result.
