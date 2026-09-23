# LOOPS Road Standard & Trust Rule (CEO, 2026-09-21)

**This is the product's core promise. Every route the engine serves is judged
against it. Quality over distance, every time.**

## Value prop (for every engineer)
Every route should be one you'd take a friend on.

## ROAD STANDARD — hard rules
1. **No primary / main roads. Ever.**
2. **No roads with a speed limit of 80 km/h or higher** — unless there is a
   segregated cycle lane on that stretch.
3. **Avoid anything tagged dangerous for cycling.**
4. **Paved only.** No gravel unless the rider explicitly asked for gravel.
5. **Prefer quiet lanes even when longer.** A better road always beats a
   shorter route.

## THE TRUST RULE
If no route meets the standard, the engine must **say so** and **mark the
compromise explicitly** — e.g. *"600 m on the R755 here"* — never silently
serve a bad route. One silent bad section costs a rider forever.

## Implementation (how this becomes real)
- **Custom routing profile** (`loops-road`, `loops-gravel`, `loops-mtb`) on our
  own routing server encoding rules 1–5 as hard costs/forbids: forbid
  motorway/trunk/primary; forbid maxspeed ≥ 80 without segregated cycleway;
  forbid/penalise hazard-tagged ways; forbid unpaved for road; heavy cost on
  busier classes so quiet lanes win even when longer.
- **Compromise detector** after every route: walk the served route's matched
  OSM ways; any stretch violating rules 1–4 is reported as
  `{ road: "R755", metres: 600, reason: "primary road" }`. The UI shows these
  prominently; zero compromises = a clean badge; if the engine could not
  avoid one, it says exactly where and why.
- **Never silent**: a route with an unreported violation is a bug, full stop.

## As applied in code (2026-09-21, evening) — owner to confirm or veto
Where: `scripts/routing/profiles/loops-road.brf` (what the engine will route
on) and `src/lib/road-segments.ts` (what we measure on the served route —
from the engine's own per-segment road tags, no external lookup).

- **Rule 1 (no main roads)** — motorway/trunk/primary forbidden in the
  profile; any ridden stretch is a `main_road` compromise.
- **Rule 2 (80 km/h+)** — applied to roads that are actually fast, because
  in Spain and France every rural lane carries a nominal 90 km/h default
  and Irish L-roads carry 80. Applied literally, the rule left Girona — our
  flagship — with **zero** routable loops. As applied:
  - 100 km/h+ on any class → fast road (compromise) unless a segregated track;
  - 80/90 on a **regional road (secondary)** → fast road when the engine
    estimates it busy (traffic class 4+) or its traffic is unknown; class
    1–3 regional roads are quiet lanes (the Ma-roads round Pollença bay
    are class 2–3). A busy R-road stays a compromise.
  - **Main roads are not impossible in the profile any more** — primary
    30×, trunk 60× (motorways impossible). With them impossible, a 200 m
    link cost more than a 70 km detour and Girona loops ballooned to
    200 km. Every main-road metre is still named; the policy decides.
  - 80/90 on a **tertiary/unclassified/residential lane** → a quiet lane,
    unless the engine estimates real traffic on it (class 4+).
  - A painted cycle lane is not segregated; only `cycleway=track/separate` is.
- **Rule 3 (dangerous)** — `class:bicycle` ≤ −2, bad `smoothness`,
  `bicycle=no`, private/no access, fords → `unsuitable`.
- **Rule 4 (paved)** — explicitly unpaved surfaces and tracks/paths
  forbidden; unpaved stretches on a road ride → `unpaved` compromise.
- **Rule 5 (quiet lanes)** — secondary costs 3×, tertiary/unclassified/
  cycleway 1×, residential 1.1×, service 1.4×.

**Engine behaviour worth knowing.** The profile's cost ceiling means a
"forbidden" road is a *last resort*, not impossible: when a via point can
only be reached over one, the engine will use it. That is why the compromise
detector is not optional — it is what turns "last resort" into "600 m on
the R755", or into a dropped candidate.

**Serving policy** (`compromiseAcceptable`): a route is served **with the
compromise named** only when it is short and unavoidable — main/fast road
stretches totalling ≤ max(500 m, 3 % of the ride) with no single stretch
over 1.5 km; unpaved ≤ 200 m; unsuitable ≤ 100 m; any motorway → never.
Anything beyond is dropped. **Exit allowance (2026-09-22):** a main/fast
stretch within 6 km of the start or finish — the way in or out of the start
town — may be up to 2.5 km (4 km total) and does not count against the
mid-ride allowance; it is always named "near the start/finish". Needed for
valley and island towns (Sóller: 1.6 km of the Ma-11 is how every rider
leaves); mid-ride limits are unchanged. Before any compromise is accepted the generator
tries to move the far point of the loop (rotated ±25°/±45°, pulled in 30 %)
to find a loop that meets the standard outright; only if the strict profile
finds no route at all does it try `loops-road-relaxed`, whose result is
measured exactly the same way.

**Owner rules, 2026-09-22 (verbatim intent):** every route starts from
home. "If it's a road to go get to the loop it's fine" — a stem out to a
loop and back along it (a lollipop) is allowed, as long as a real loop
(≥ 25 % of the ride) remains; a mid-ride U-turn is still a spur. "It
becomes its own loop, like a derivative loop" — ride out + verified loop +
ride back is served as a NEW loop from your start, built on the verified
one, and sized to the ask: when the full loop would overshoot, only part
of it is ridden before turning for home.

**Library routes are measured too (2026-09-23).** Uploads, imports and
library loops carried no road report, so the Trust Rule only covered fresh
generation. Now the first view of a route without one traces its track
through the engine after the response (`src/lib/road-trace.ts`: via points
every ~0.8 km on the neutral `trekking` profile — the Road Standard profile
would dodge exactly what we want to find — then the same `buildRoadReport`)
and stores it. Unknown beats wrong: a trace whose length is > 8 % off the
track, a failed chunk, or > 20 s stores nothing and is retried an hour
later. The report reads exactly like a generated route's ("Meets the Loops
road standard…" / "Compromise: 4.3 km on a primary road…"). Measured on
the bundled Dublin set: the two Skerries loops meet the standard; the Canal
Ride (~5 km gravel towpath) and the Wicklow 200 (~11 km primary) do not and
are not bundled.

**Crossings and disciplines (2026-09-23).** A main/fast-road stretch under
100 m is a junction or roundabout crossing, not riding the road (Faro's
"compromises" were 45–96 m traversals of the EN125/N2 ring every loop must
cross) — not reported, though still counted in `main_road_pct`; surface and
access hazards count from 40 m. "Unsuitable" by surface is discipline-aware:
`smoothness=bad` and `class:bicycle` −2 are hazards on a road bike and the
terrain of a gravel ride — gravel treats only horrible+ and −3 as
unsuitable, MTB only impassable; access bans and fords stay unsuitable for
everyone. Reports carry `rules_version` (ROAD_RULES_VERSION); older stored
reports are re-traced on next view.

**Ride verdict (2026-09-23).** The weather card says what the wind will do
to THIS loop at THIS time (`src/lib/ride-wind.ts`), judging each stretch
against the forecast for the hour the rider reaches it. It never suggests
riding the loop the other way round: under a steady wind that does not
change the out/home balance — the start point decides it (if you start at
the south end you go north first either way).

**Access retrace.** A shared out/back stretch within the first and last
6 km (a causeway, a peninsula, the one quiet road out of a city) is allowed
and reported as `ACCESS_RETRACE`. A mid-route out-and-back over 400 m is a
spur and the candidate is rejected (`SPUR_UTURN`).

**Status (2026-09-22, local engine with the v3 profiles):** Clontarf 3 loops
meeting the standard; Girona 2 loops (82.9 km with ~2 km of national road
in 4 named stretches; 93.9 km with ~0.5 km); Calpe "263 m on the CV-734";
Mallorca from Port de Pollença 2 loops (~1.1 km of named regional/primary
links each). Production shows the same only after the routing server is
rebuilt with cloud-init v3 (owner action: Hetzner token).

**Library measured (2026-09-23, rules v2, 107 routes):** 8 meet the
standard, 86 carry named compromises, 13 unknown. Algarve 0/8 clean,
Tenerife 0/8, Mallorca 1/21, Girona/Cataluña 2/32, Gran Canaria 2/7. The
iconic climbs are OSM "primary" (TF-21, GC-60, Ma-10 links) and the engine
data carries no traffic estimate or maxspeed for them, so rule 1 cannot be
made traffic-aware there without letting busy roads through. Serving policy
for library loops in Generate is the owner switch `LIBRARY_ROAD_POLICY`
("name" default — offered with the compromise named, clean loops first;
"enforce" — dropped). Recommendation on record: keep "name": routes are
facts, and the rider sees exactly which metres are on which road.
