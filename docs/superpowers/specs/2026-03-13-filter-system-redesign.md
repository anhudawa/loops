# Filter System Redesign — Design Spec

**Date**: 2026-03-13
**Status**: Draft
**Goal**: Make the filter system LOOPS' standout feature — duration-first, location-aware, instant

---

## Context

LOOPS is a login-gated cycling route discovery app. The current filter system is functional but generic: discipline pills, country/region/difficulty/surface dropdowns, distance range inputs. It doesn't answer the cyclist's #1 question: "I have 2 hours — what can I ride near me?"

This redesign makes duration the hero interaction, blends proximity with rating for smart ranking, and draws from best-in-class UX patterns (Airbnb's filter chips, AllTrails' dynamic count, Komoot's duration filtering, Uber's preset tiles).

---

## 1. Filter Architecture

Three-tier layout, top to bottom:

### Tier 1: Duration Hero Strip

"How long have you got?" with 4 large tappable tiles:

| Tile | Label | Subtitle (personalized) |
|------|-------|------------------------|
| 1 | **1h** | ~25 km |
| 2 | **2h** | ~50 km |
| 3 | **3h** | ~75 km |
| 4 | **4h+** | ~100 km |

- Subtitles computed from user's zone 2 speed setting
- Single-select: tap to select, tap again to deselect
- Selected tile gets green border + green text, background shifts to dark green
- Unselected tiles have subtle border, white text

### Tier 2: Discipline Tabs

Full-width tab bar: **All** | **Road** | **Gravel** | **MTB**

- Single-select, "All" is default
- Active tab: green text + green bottom border
- Inactive tabs: grey text

### Tier 3: Refine Chips

Horizontally scrollable row of secondary filter chips:

- **Difficulty** — dropdown: Easy, Moderate, Hard, Expert
- **Surface** — dropdown with display labels mapped to DB values:
  - "Road" → `road`
  - "Gravel" → `gravel`
  - "Trail" → `trail`
  - "Mixed" → `mixed`
- **Region** — dropdown: dynamically populated from database, scoped to user's detected country (from geolocation reverse-geocode or profile country). Falls back to all regions if country unknown.
- **Verified** — toggle chip

Each chip:
- Inactive: subtle border, grey text, ▾ indicator
- Active: green background, dark text, ✕ to clear

### Below Filters

- **Sort indicator + live count**: "Nearby · Best rated — 8 routes"
- **Route cards**: distance, estimated duration (green), elevation gain, rating badge, proximity badge
- **Floating CTA** (mobile): "Show X Routes" fixed at bottom, count updates instantly. Tapping scrolls to the route list (it's a scroll-to-results button, not a confirmation action — filters apply instantly regardless).
- **Empty state**: When filters produce 0 results, show: "No routes match your filters" with a "Clear all filters" button. If only duration is active, suggest adjacent tiles ("Try 1h or 3h instead").

---

## 2. Ranking System

### Proximity Zones

Three zones based on Haversine distance from user's location:

| Zone | Range | Description |
|------|-------|-------------|
| Nearby | < 25 km | Immediate area |
| Regional | 25–75 km | Short drive |
| Further | 75+ km | Worth a trip |

Within each zone, routes sort by average rating (highest first).

### Rating Boost Promotion

Routes meeting BOTH criteria get promoted one zone up:
- Average rating ≥ 4.5 stars
- At least 3 ratings

Example: A 4.8★ route at 40km (Regional) appears in the Nearby section.

### SQL Implementation

Zone assignment and promotion are computed in SQL using a `CASE WHEN` expression:

```sql
WITH routes_with_distance AS (
  SELECT r.*,
    AVG(rr.rating) AS avg_rating,
    COUNT(rr.id) AS rating_count,
    -- Haversine computed in SQL (Vercel Postgres = standard PostgreSQL)
    6371 * acos(
      cos(radians($user_lat)) * cos(radians(r.start_lat)) *
      cos(radians(r.start_lng) - radians($user_lng)) +
      sin(radians($user_lat)) * sin(radians(r.start_lat))
    ) AS haversine_distance
  FROM routes r
  LEFT JOIN route_ratings rr ON rr.route_id = r.id
  WHERE r.discipline = $discipline  -- optional filters
  GROUP BY r.id
)
SELECT *,
  CASE
    WHEN haversine_distance < 25 THEN 1  -- Nearby
    WHEN haversine_distance < 75 THEN 2  -- Regional
    ELSE 3                                -- Further
  END AS base_zone,
  CASE
    WHEN avg_rating >= 4.5 AND rating_count >= 3 THEN -1
    ELSE 0
  END AS zone_boost
FROM routes_with_distance
ORDER BY (base_zone + zone_boost) ASC, avg_rating DESC NULLS LAST
LIMIT $limit OFFSET $offset
```

**Pagination note:** Zone assignments are deterministic for a given user location, so OFFSET-based pagination is stable. The zone + boost score is computed per-row, not cached.

**Recommended indexes** (add to migration):
```sql
CREATE INDEX idx_routes_discipline ON routes(discipline);
CREATE INDEX idx_routes_surface_type ON routes(surface_type);
CREATE INDEX idx_routes_difficulty ON routes(difficulty);
CREATE INDEX idx_route_ratings_route_id ON route_ratings(route_id);
```

Start coordinates (`start_lat`, `start_lng`) are extracted from the first coordinate in the route's `coordinates` JSON. If these don't exist as columns yet, add them to the routes table in the migration and backfill from existing coordinate data.

### No Location Fallback

When geolocation is unavailable or denied:
- Sort purely by rating (highest first)
- Group by country
- Show prompt: "Enable location to see routes near you"

**Geolocation loading state:** Routes load immediately with the no-location fallback (sorted by rating). When geolocation resolves, results re-sort into proximity zones with a brief fade transition. This avoids blocking the UI on the permission prompt.

### Sort Options

Default: Nearby + Best Rated (the zone system above)

User can override:
- **Nearest first** — pure distance sort
- **Top rated** — pure rating sort
- **Newest** — creation date
- **Duration match** — closest to selected duration tile

---

## 3. Data Model & User Settings

### New User Profile Field

```
avg_speed_kmh DECIMAL DEFAULT 25
```

Added to `users` table. Range: 15–45 km/h. Set via profile settings with a labeled slider: "Your typical cruising speed."

### Estimated Duration Calculation

```
estimated_minutes = (distance_km / avg_speed_kmh × 60) + (elevation_gain_m / 10)
```

- Base: distance ÷ speed
- Elevation adjustment: +1 minute per 10m of climbing
- Computed at API response time, not stored in DB
- Uses user's `avg_speed_kmh` if authenticated, otherwise 25 km/h default

### Duration Tile Filtering

Duration filtering uses **computed estimated_minutes** (the same formula above, including elevation), NOT a simple distance range conversion. This ensures a hilly 45km route and a flat 55km route both appear under "2h" if they both estimate to ~120 minutes.

**Server-side implementation:** When a duration tile is selected, the API computes `estimated_minutes` for each candidate route using the user's speed and the route's elevation, then filters:

```
Contiguous boundaries (no gaps, no overlaps):
  1h:  WHERE estimated_minutes <= 90
  2h:  WHERE estimated_minutes > 90  AND estimated_minutes <= 150
  3h:  WHERE estimated_minutes > 150 AND estimated_minutes <= 240
  4h+: WHERE estimated_minutes > 240
```

Boundaries are contiguous — every route falls into exactly one tile. The ranges are generous: "1h" includes anything up to 1.5h, "2h" covers 1.5-2.5h, "3h" covers 2.5-4h, "4h+" is everything beyond.

**Duration subtitles on tiles** are approximate and use the simpler distance formula (speed × hours) for display only. They give the user a quick distance reference without implying precision.

### Logged-Out Users

All filters, route cards, and the duration strip are behind login. Logged-out users see the login page only. The 25 km/h default applies to new authenticated users who haven't set their speed preference yet.

---

## 4. Mobile Layout (< 768px)

```
┌─────────────────────────┐
│  LOOPS            Sign in│  ← Sticky nav
├─────────────────────────┤
│  How long have you got?  │
│  ┌────┬────┬────┬─────┐ │
│  │ 1h │ 2h │ 3h │ 4h+ │ │  ← Duration hero strip
│  │25km│50km│75km│100km│ │
│  └────┴────┴────┴─────┘ │
├─────────────────────────┤
│ All │ Road │Gravel│ MTB  │  ← Discipline tabs
├─────────────────────────┤
│ Difficulty▾ Surface▾ ...│  ← Scrollable refine chips
├─────────────────────────┤
│ Nearby·Best rated  8 rts│  ← Sort + count + Map toggle
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │   Route Card         │ │
│ │   82km · ~2h45 · ↑1k│ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │   Route Card         │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│    [ Show 8 Routes ]     │  ← Fixed bottom CTA
└─────────────────────────┘
```

- Duration strip: 4 tiles in a single row, equal width
- Map: hidden by default, toggle via "Map" button in sort/count bar
- "Show X Routes": fixed at bottom, always visible while scrolling
- Route cards: single column, full width

## 5. Desktop Layout (≥ 768px)

```
┌──────────────────────────────────────────────────┐
│  LOOPS                                    Sign in│
├────────────────┬─────────────────────────────────┤
│ How long have  │                                 │
│ you got?       │                                 │
│ ┌──┬──┬──┬───┐│                                 │
│ │1h│2h│3h│4h+││           MAP VIEW              │
│ └──┴──┴──┴───┘│                                 │
│ All│Road│Grvl │         (Leaflet map with        │
│ ────────────  │          route markers)          │
│ Difficulty▾   │                                 │
│ Surface▾      │                                 │
│ Region▾       │                                 │
│ ────────────  │                                 │
│ 8 routes      │                                 │
│ ┌────────────┐│                                 │
│ │ Route Card ││                                 │
│ └────────────┘│                                 │
│ ┌────────────┐│                                 │
│ │ Route Card ││                                 │
│ └────────────┘│                                 │
└────────────────┴─────────────────────────────────┘
```

- Left panel (~320px): filters stacked vertically + scrollable route list
- Right panel: full map with synced markers
- Hover card → highlight marker; click marker → scroll to card
- No floating CTA needed — results update live in the panel

---

## 6. Filter Persistence

### URL Query Params

All filter selections reflected in URL:

```
/?discipline=road&duration=2h&difficulty=hard&region=wicklow
```

- Shareable: send a friend a pre-filtered URL
- Bookmarkable: save "my usual search"
- Browser back/forward works with filter state

### localStorage Fallback

- Last-used filters saved to localStorage
- On page load: **URL params are a full replacement** — if ANY URL params are present, localStorage is ignored entirely. This prevents confusing merges when opening shared links.
- If no URL params: load from localStorage
- If neither: use defaults (All disciplines, no duration, no refine filters)

---

## 7. Route Card Updates

Each route card displays:

```
┌─────────────────────────────┐
│ [Cover photo / map preview] │
│                    4.8 ★    │  ← Rating badge (top right)
│              3.2 km away    │  ← Proximity badge (bottom left)
├─────────────────────────────┤
│ Wicklow Gap Loop            │
│ 82 km · ~2h 45m · 1,240m ↑ │  ← Duration in green
│ [Road] [Hard]               │  ← Discipline + difficulty badges
└─────────────────────────────┘
```

- Estimated duration shown in green, personalized to user's speed
- Proximity badge only shown when geolocation is available
- Rating badge only shown when route has ratings

---

## 8. Interactions & Transitions

### Filter Changes

All filter changes trigger:
1. Instant API call with debounce (150ms)
2. Route count updates in sort bar and floating CTA
3. Route cards re-render with fade transition
4. Map markers update to match filtered results

### Duration Tile Interaction

- Tap: select (green highlight), deselect others
- Tap selected: deselect (clear duration filter)
- Km subtitle updates if user changes their speed setting

### Chip Dropdown Behavior

- Tap chip → dropdown appears below (or bottom sheet on mobile for small screens)
- Select option → chip turns green with selection text + ✕
- Tap ✕ → clear that filter
- Tap outside → close dropdown

---

## 9. Files to Modify

| File | Changes |
|------|---------|
| `src/components/FilterSidebar.tsx` | Replace entirely with new three-tier filter component |
| `src/app/page.tsx` | Update filter state management, add duration logic, URL param sync |
| `src/lib/db.ts` | Update `getRoutes` with proximity zones, rating boost, duration filtering; add migration for `avg_speed_kmh` column on users table |
| `src/app/api/routes/route.ts` | Accept duration param, pass user speed to query |
| `src/config/constants.ts` | Add: `DURATION_TIERS` (boundaries in minutes), `PROXIMITY_ZONES` (thresholds in km), `DEFAULT_SPEED_KMH` (25), `SURFACE_LABELS` (display→DB map), `ELEVATION_MINUTES_PER_10M` (value: 1) |
| `src/components/RouteCard.tsx` | Add estimated duration display, proximity badge |
| `src/app/profile/[id]/page.tsx` | Add speed setting slider |
| `src/app/api/profile/route.ts` | Accept avg_speed_kmh update |

### New Files

| File | Purpose |
|------|---------|
| `src/components/DurationStrip.tsx` | Duration hero strip component |
| `src/components/DisciplineTabs.tsx` | Discipline tab bar component |
| `src/components/RefineChips.tsx` | Secondary filter chips with dropdowns |
| `src/components/FilterBar.tsx` | Orchestrator: composes Duration + Discipline + Refine |
| `src/components/ShowRoutesButton.tsx` | Floating CTA with dynamic count |

---

## 10. What Changes From Current

- **Country filter removed** — replaced by proximity zones (location-based) and region scoped to detected country
- **Distance min/max inputs removed** — replaced by duration tiles
- **FilterSidebar.tsx replaced** — the entire component is rebuilt as FilterBar with sub-components
- **`useIsSmScreen` breakpoint updated** — from 640px (Tailwind `sm`) to 768px (Tailwind `md`) to match this spec

---

## 11. What This Does NOT Include

- Search by name/text (Phase 5 feature)
- Multi-discipline tagging (Phase 5 feature)
- Map-based spatial filtering ("draw a box")
- Saved/favorite filters
- Filter presets ("Sunday morning ride")
- Weather integration in duration estimates

---

## Success Criteria

- Duration tiles are the first thing a user sees and interacts with
- Selecting "2h" + "Road" shows relevant routes within 2 seconds
- Route cards show personalized estimated duration
- Proximity zones surface nearby routes first, with rating boost for exceptional routes
- All filters reflected in URL (shareable)
- Mobile layout is thumb-friendly with 44px minimum touch targets
- "Show X Routes" count updates in < 300ms of filter change
