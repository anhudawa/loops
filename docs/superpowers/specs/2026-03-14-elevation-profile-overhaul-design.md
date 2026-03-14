# Elevation Profile & Key Climbs Overhaul — Design Spec

## Goal

Replace the current basic elevation chart and collapsible climb table with a Strava/Komoot-quality experience: gradient-coloured profile, interactive map sync, proper HC/Cat climb categorisation, and mobile touch support.

## Current State

Single `ElevationProfile.tsx` component (540 lines):
- Canvas-based chart with a flat neon green line and fill
- Hover tooltip (desktop only — broken on mobile)
- Climb detection algorithm that finds uphill segments
- Key climbs shown in a collapsible table with columns: km range, gain, length, avg %, peak
- No gradient colouring on the profile line
- No map integration
- Climb "names" are just "km X–Y"

## Design

### 1. Gradient-Coloured Elevation Profile

The elevation line is colour-coded by gradient steepness at each point:

**Uphill (positive gradient):**

| Gradient | Colour | Hex |
|----------|--------|-----|
| 0–3% | Green | `#00ff88` |
| 3–5% | Yellow-green | `#bbff00` |
| 5–7% | Orange | `#ffbb00` |
| 7–10% | Red | `#ff5533` |
| 10%+ | Purple | `#cc33ff` |

**Downhill (negative gradient):** All descents use a single muted blue-grey (`#6688aa`) regardless of steepness. This keeps visual emphasis on the climbs — which is what cyclists care about when reading a profile.

**Flat (gradient ≈ 0%):** Treated as the bottom of the uphill scale (green, `#00ff88`). The threshold between "flat" and "uphill" is 0% — any positive gradient gets the uphill colour scale.

These colours already exist in the current `gradientColor()` function — we're extending them from the climb table to the profile line itself.

**Implementation:** Canvas renders the profile as many small line segments, each coloured by the local gradient between consecutive points. The fill beneath uses a subtle gradient from the line colour down to transparent.

**Gradient legend:** A compact row below the chart showing the colour scale with percentage labels.

### 2. Interactive Tooltip (Desktop + Mobile)

**Desktop:** Hover/mousemove shows a crosshair on the chart with a tooltip displaying:
- Elevation (m)
- Distance (km)
- Local gradient (%)

**Mobile:** Touch and drag across the chart to scrub. Same tooltip, triggered by `touchstart`/`touchmove` instead of mousemove. `touchend` dismisses.

### 3. Map ↔ Profile Sync

Bidirectional sync between the elevation profile and the Leaflet map:

- **Profile → Map:** As the user hovers/drags across the profile, a marker (circle marker) moves along the route polyline on the map at the corresponding position.
- **Map → Profile:** Clicking a point on the route polyline highlights the corresponding position on the elevation profile with a crosshair.
- **Climb card → Map:** Tapping a climb card zooms the map to show that climb's start-to-end section, highlighted on the polyline.

**Communication:** The `ElevationProfile` component accepts an `onPositionChange(index: number | null)` callback and a `highlightIndex: number | null` prop. The route detail page manages the shared state between `MapView` and `ElevationProfile`.

**Map → Profile detail:** When the user clicks a point on the route polyline in the map, the handler finds the nearest coordinate index (by comparing the click latlng to the coordinates array using haversine distance) and sets `highlightIndex` to that index. The elevation profile then draws a vertical crosshair line at the corresponding x-position on the canvas.

**Debouncing:** Profile → Map position updates are throttled to 60fps (via `requestAnimationFrame`) to avoid excessive re-renders. Map → Profile clicks are not debounced (discrete events).

### 4. Climb Categorisation (HC / Cat 1–4)

Replace the current table with proper climb cards using Strava's category system.

**Category formula** (based on length × average gradient):

| Score (length_km × avg_gradient_%) | Category |
|-------------------------------------|----------|
| ≥ 80 | HC (Hors Catégorie) |
| ≥ 40 and < 80 | Cat 1 |
| ≥ 20 and < 40 | Cat 2 |
| ≥ 8 and < 20 | Cat 3 |
| ≥ 3 and < 8 | Cat 4 |
| < 3 | Uncategorised (not shown) |

**Minimum climb threshold:** A segment must gain ≥30m elevation and sustain ≥2% average gradient to qualify as a climb candidate. This filters out false positives from gradual terrain.

**Climb summary header:** Shows total climb count and breakdown by category (e.g., "4 climbs: 1 HC, 1 Cat 2, 1 Cat 3, 1 Cat 4").

**Each climb card displays:**
- Category badge (HC/Cat 1-4), colour-coded to match the gradient scale
- Start km → End km (with total length)
- Start elevation → End elevation + total gain
- Average gradient % (large, prominent)

Cards are ordered by position on the route (start km ascending). This matches the natural reading order as a cyclist rides the route — you see the first climb first, last climb last.

Tapping a climb card triggers the map sync (zooms map to that section).

### 5. Page Layout Change

The current 2-column layout (description | elevation) is replaced. New order within the route detail page:

1. Map (hero, unchanged)
2. Weather card (unchanged)
3. Title card + stats (unchanged)
4. Uploaded by (unchanged)
5. **Elevation Profile** (full-width, gradient-coloured, interactive) — NEW
6. **Climb Summary + Climb Cards** — NEW
7. About this route (full-width, was half-width)
8. Photos, Share/Actions, Conditions, Comments (unchanged)

### 6. Component Architecture

Split the current monolithic `ElevationProfile.tsx` into focused components:

| File | Responsibility |
|------|---------------|
| `ElevationProfile.tsx` | Canvas chart with gradient line, tooltip, touch/hover interaction. Accepts `onPositionChange` and `highlightIndex` props. |
| `ClimbCards.tsx` | Climb summary header + individual climb cards. Accepts climbs array and `onClimbSelect` callback. |
| `lib/climb-detection.ts` | Pure functions: `detectClimbs()`, `categoriseClimb()`, `smoothElevations()`, `haversine()`. Extracted from the current component for testability. |

The route detail page (`routes/[id]/page.tsx`) manages the shared hover position state between `ElevationProfile` and `MapView`.

`MapView.tsx` gets a new optional prop: `hoverPosition: { lat: number; lng: number } | null` — renders a circle marker at that lat/lng when set. The `coordinates` prop throughout is `[number, number, number][]` (arrays of `[lat, lng, elevation]` tuples), matching the existing route data format stored in the database.

**Edge cases:**
- Routes with no elevation data: Show a flat line at 0m, hide climb cards section entirely.
- Routes with < 5 coordinate points: Render the profile but skip climb detection (not enough data for meaningful analysis).
- Coordinates with missing/NaN elevation values: Skip those points during rendering and climb detection. Use linear interpolation between valid neighbours for display continuity.

### 7. Category Colours

Each category uses its own colour, derived from the gradient scale:

| Category | Colour | Usage |
|----------|--------|-------|
| HC | `#cc33ff` (purple) | Badge bg, border accent |
| Cat 1 | `#ff5533` (red) | Badge bg, border accent |
| Cat 2 | `#ffbb00` (orange) | Badge bg, border accent |
| Cat 3 | `#bbff00` (yellow-green) | Badge bg, border accent |
| Cat 4 | `#00ff88` (green) | Badge bg, border accent |

Badges use 15% opacity background with 25% opacity border, matching the existing LOOPS neon-on-dark style.

### 8. Algorithms

**Elevation smoothing:** Apply a simple moving average with a 5-point window to the raw elevation data before both rendering and climb detection. This reduces GPS noise while preserving the shape of real terrain features. The smoothed data is used for all gradient calculations and visual rendering; the raw data is never displayed.

```
smoothed[i] = average(elevation[i-2], elevation[i-1], elevation[i], elevation[i+1], elevation[i+2])
```
For points near the start/end of the array, use a shorter window (asymmetric, available points only).

**Gradient calculation:** Between consecutive (smoothed) points, gradient is:

```
gradient_% = (elevation_delta / horizontal_distance) × 100
```

Where `horizontal_distance` is the haversine distance between the two lat/lng coordinates (ignoring elevation — this is standard cycling gradient calculation). This produces the gradient used for both line colouring and tooltip display.

**Tooltip gradient:** The tooltip shows a **local average** over a ±3 point window around the hovered point, not the raw point-to-point gradient. This gives a stable, readable value that matches what a cyclist would perceive on the road.

**Climb detection algorithm:** Retain the existing detection logic from the current `ElevationProfile.tsx` (which identifies sustained uphill segments with a smoothing pass). The key parameters:

1. Walk through smoothed elevation data sequentially
2. A climb **starts** when gradient exceeds 2% for 3+ consecutive points
3. A climb **ends** when gradient drops below 1% for 5+ consecutive points (this tolerance allows brief flat sections within a climb without splitting it)
4. After detection, filter: discard climbs with < 30m total elevation gain
5. Categorise remaining climbs using the score formula (Section 4)

**Climb card → Map zoom:** When a climb card is tapped, the map fits bounds to the climb's start-to-end coordinates with 20% padding. The climb section is highlighted on the polyline using a thicker line (weight 5 vs normal 3) in the climb's category colour. The highlight is dismissed when: another climb card is tapped (replaces highlight), or the user taps anywhere on the map outside the polyline.

**Data flow (parent page orchestration):**
1. Parent page holds `hoverIndex: number | null` state
2. `ElevationProfile` calls `onPositionChange(index)` on hover/touch
3. Parent converts `coordinates[index]` to `{ lat, lng }` and passes to `MapView` as `hoverPosition`
4. `MapView` click on polyline → parent finds nearest index via haversine → sets `highlightIndex` on `ElevationProfile`

## Out of Scope

- Named climbs (would require manual data entry or external API)
- Strava segment matching
- Power/heart rate overlays
- Downloadable climb images
- Climb leaderboards

## Data Requirements

No database changes. All data is computed client-side from the existing `coordinates` JSON (which contains `[lat, lng, elevation]` tuples) already stored on each route.
