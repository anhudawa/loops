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
