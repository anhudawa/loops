# Dublin Route Seeding — Design Spec

**Date:** 2026-03-14
**Status:** Draft
**Scope:** Seed LOOPS with 10 high-quality Dublin road routes and 10 fake users

---

## Context

LOOPS lives or dies by route quality. Before user-generated content can sustain the platform, we need to seed it with real, verified routes that Dublin cyclists would actually ride. This spec covers the v1 seed: 10 curated Dublin road routes sourced from real cycling sources, attributed to 10 realistic fake users, with scattered ratings and comments to make the community feel alive.

### What this is NOT
- Not Netflix-style suggestions (roadmap)
- Not device sync / Garmin / Wahoo / Hammerhead integration (roadmap)
- Not scaling beyond Dublin or beyond road discipline (future seeding rounds)
- Not a user-submitted routes workflow

---

## Routes

### Selection Criteria
- Real routes that Dublin cyclists actually ride
- Sourced from verified cycling sources (EpicRoadRides, Outsider.ie, ActiveMe.ie, RideWithGPS, Komoot)
- Real GPX data with accurate coordinates and elevation
- Mix of distance buckets: short (30-50km), medium (50-70km), long (70-100km), epic (100km+)
- All road discipline, Dublin/Wicklow area
- Must form loops (start near finish)

### The 10 Routes

| # | Bucket | Route Name | ~Dist | ~Elev | Primary Source |
|---|--------|-----------|-------|-------|----------------|
| 1 | Short | Howth Head Loop | 37km | 260m | EpicRoadRides, RideWithGPS |
| 2 | Short | Sally Gap from Roundwood | 42km | 680m | Outsider.ie |
| 3 | Medium | Glenmacnass & Glencree Loop | 63km | 870m | EpicRoadRides |
| 4 | Medium | Shay Elliott & Slieve Maan | 59km | 980m | EpicRoadRides |
| 5 | Short | Roundwood & Rathdrum Figure of 8 | 48km | 520m | EpicRoadRides |
| 6 | Medium | Tinahely Loop | 70km | ~600m | Outsider.ie |
| 7 | Long | Wicklow Gap, Sally Gap & Blessington | 70km | 1,000m | EpicRoadRides, Outsider.ie |
| 8 | Long | Meeting of the Waters | 80km | ~900m | Outsider.ie |
| 9 | Long | Rathdrum-Wicklow Gap-Dublin | 74km | 1,130m | Outsider.ie |
| 10 | Epic | Blessington-Glendalough-Sally Gap Loop | 101km | 911m | ActiveMe.ie (GPX available) |

### GPX Sourcing Strategy
1. **RideWithGPS first** — search for each route by name/area. The app already supports RideWithGPS URL import, so this is the fastest path to real GPS data.
2. **ActiveMe.ie** — Route 10 has a direct GPX download available.
3. **Komoot** — fallback for routes not found on RideWithGPS.
4. **Manual plotting** — last resort. Use RideWithGPS route planner to trace the known roads (R115, R755, R756, R758, R759, etc.) and export GPX.

### Route Metadata
Each route gets:
- `name` — as listed above
- `description` — 1-2 sentences describing the ride character and key landmarks
- `difficulty` — easy/moderate/hard/expert based on elevation and distance
- `distance_km` — from GPX parse (not manually set)
- `elevation_gain_m` — from GPX parse
- `elevation_loss_m` — from GPX parse
- `start_lat` / `start_lng` — extracted from first coordinate point of parsed GPX
- `surface_type` — "road" for all
- `discipline` — "road" for all
- `county` — "Dublin" or "Wicklow" depending on where the route primarily sits
- `country` — "Ireland"
- `region` — same as county
- `coordinates` — parsed from GPX

---

## Fake Users

### Design Principles
- Realistic Irish names
- Bios mention where they ride and what kind of riding they prefer
- No cycling club affiliations
- DiceBear avatars (consistent, non-stock-photo)
- All Dublin area

### The 10 Users

| # | Name | Bio | Location |
|---|------|-----|----------|
| 1 | Ciaran Murphy | Rides out of Marlay Park most weekends. Loves a big Wicklow day. | South Dublin |
| 2 | Aoife Brennan | South Dublin, chasing every climb in the mountains. | Rathfarnham |
| 3 | Declan O'Brien | Howth regular. Sea air and suffering. | Howth |
| 4 | Niamh Fitzgerald | Commuter turned weekend warrior. Based in Ranelagh. | Ranelagh |
| 5 | Ronan Kelly | Blessington area. Knows every back road in west Wicklow. | Blessington |
| 6 | Sinead Walsh | Dun Laoghaire. Will ride anything with a coast road. | Dun Laoghaire |
| 7 | Conor Byrne | Rathmines. Prefers long steady efforts over punchy climbs. | Rathmines |
| 8 | Emma Daly | Dalkey. Short loops during the week, big spins on Saturdays. | Dalkey |
| 9 | Padraig Nolan | Lucan. Always looking for new routes west of the city. | Lucan |
| 10 | Sarah Kavanagh | Greystones. If it doesn't have at least one gap road, not interested. | Greystones |

### User Emails
Seed users get placeholder emails in the format `{firstname}.{lastname}@seed.loops.ie` (e.g. `ciaran.murphy@seed.loops.ie`). These are not real email addresses — they exist only to satisfy the `NOT NULL UNIQUE` constraint on the users table.

### Avatar Generation
Use DiceBear Adventurer style: `https://api.dicebear.com/9.x/adventurer/svg?seed={name}`

This gives each user a unique, consistent avatar without needing stock photos.

---

## Social Activity Seeding

### Route Attribution
Each user uploads 1-3 routes (not evenly distributed — some users are more prolific):

| User | Routes |
|------|--------|
| Ciaran Murphy | Wicklow Gap Sally Gap & Blessington, Blessington-Glendalough-Sally Gap Loop |
| Aoife Brennan | Shay Elliott & Slieve Maan |
| Declan O'Brien | Howth Head Loop |
| Niamh Fitzgerald | Sally Gap from Roundwood |
| Ronan Kelly | Tinahely Loop, Meeting of the Waters |
| Sinead Walsh | Glenmacnass & Glencree Loop |
| Conor Byrne | Rathdrum-Wicklow Gap-Dublin |
| Emma Daly | Roundwood & Rathdrum Figure of 8 |
| Padraig Nolan | — (rater/commenter only) |
| Sarah Kavanagh | — (rater/commenter only) |

### Ratings
- 30-40 total ratings scattered across all 10 routes
- Each user rates 3-5 routes they didn't upload
- Scores range 3-5 stars (no 1-2 star ratings — these are curated quality routes)
- Every route should have at least 2 ratings

### Comments
- 15-20 total comments across routes
- Short, natural language: "Did this last Saturday, roads were perfect", "The climb after Laragh is no joke", "Great route but watch for traffic on the N11 section"
- 1-3 comments per route, not every route needs comments
- Attributed to users who didn't upload that route

### What We Don't Seed
- No follows between users (overkill for 10 users)
- No condition reports (too time-specific to fake convincingly)
- No photo uploads (would need stock photos, looks fake)

---

## Implementation Approach

### Seed Script
Replace the existing `scripts/seed.ts` with a new seed focused on real Dublin routes. The old seed (fake coordinates, international gravel routes) is no longer needed — the production database already has real routes uploaded by users.

1. **Manifest file** (`scripts/seed-data/manifest.json`) — maps each route to its GPX source (RideWithGPS URL or local GPX file path), metadata overrides, and assigned user
2. **GPX files** stored in `scripts/seed-data/gpx/` — downloaded from sources listed above
3. **Script flow:**
   - Create 10 users with bios, locations, DiceBear avatar URLs
   - For each route in manifest: parse GPX through existing `route-parser.ts`, insert with metadata and `created_by`
   - Insert ratings (ratings table)
   - Insert comments (comments table)
4. **Idempotent** — seed users use deterministic UUIDs (UUID v5 with a `loops-seed` namespace). Script deletes all routes/ratings/comments belonging to seed user IDs before re-inserting. This preserves any real user data.

### Timestamp Staggering
Seed data should not all have the same `created_at`. Backdate routes over the past 2-3 months, with comments and ratings added days/weeks after route creation. This makes the community feel organic rather than obviously seeded.

### Verification Step
After seeding:
- Review each route on the live map at loops.ie
- Confirm GPX renders correctly (no wild coordinate jumps, route follows real roads)
- Confirm distance/elevation are reasonable
- Flag any routes that need swapping

### File Structure
```
scripts/
  seed.ts                    # Replacement seed script
  seed-data/
    manifest.json            # Route manifest with metadata + GPX sources
    gpx/                     # Downloaded GPX files
      howth-head-loop.gpx
      sally-gap-roundwood.gpx
      ...
    comments.json            # Pre-written comments
    ratings.json             # Pre-defined rating assignments
```

---

## Success Criteria
1. 10 routes visible on the home page map, all rendering correctly with real GPS traces
2. 10 user profiles that look realistic (name, avatar, bio, location)
3. Every route has at least 2 ratings and an average score displayed
4. Routes span all 4 distance buckets
5. Anthony (the founder, Dublin-based cyclist) has personally verified each route is a real, quality ride

---

## Sources
- [EpicRoadRides - Cycling Ireland's Wicklow Mountains](https://epicroadrides.com/cycling-blog/cycling-ireland-wicklow-mountains/)
- [Outsider.ie - Road Cycling Routes in Wicklow](https://outsider.ie/ireland/road-cycling-routes-wicklow/)
- [ActiveMe.ie - Blessington Lakes Loop](https://www.activeme.ie/guides/blessington-lakes-wicklow-mountains-and-glendalough-loop-cycling-route-wicklow-ireland/)
- [RideWithGPS - Dublin Region](https://ridewithgps.com/regions/europe/ie/108-dublin-ireland)
- [Komoot - Road Cycling in Dublin](https://www.komoot.com/guide/20897/road-cycling-routes-in-dublin)
