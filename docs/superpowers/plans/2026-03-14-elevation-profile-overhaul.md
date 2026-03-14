# Elevation Profile & Key Climbs Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic elevation chart and climb table with a gradient-coloured profile, HC/Cat climb cards, map sync, and mobile touch support.

**Architecture:** Extract pure climb-detection logic into `src/lib/climb-detection.ts`. Rebuild `ElevationProfile.tsx` with gradient-coloured canvas rendering and touch support. Create new `ClimbCards.tsx` component. Wire bidirectional sync through parent page state in `routes/[id]/page.tsx`. Add `hoverPosition` prop to `MapView.tsx`.

**Tech Stack:** React 19, TypeScript, Canvas API, Leaflet, Vitest (new — for unit testing pure functions)

**Spec:** `docs/superpowers/specs/2026-03-14-elevation-profile-overhaul-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/climb-detection.ts` | **Create** | Pure functions: `haversine()`, `smoothElevations()`, `computeGradients()`, `gradientColor()`, `detectClimbs()`, `categoriseClimb()`, `downsample()`. All extracted from current `ElevationProfile.tsx`. |
| `src/components/ElevationProfile.tsx` | **Rewrite** | Canvas chart with gradient-coloured line segments, gradient fill, legend, tooltip (desktop hover + mobile touch), `onPositionChange`/`highlightIndex` props. Imports from `climb-detection.ts`. |
| `src/components/ClimbCards.tsx` | **Create** | Climb summary header + individual climb cards with HC/Cat badges. `onClimbSelect` callback. |
| `src/components/MapView.tsx` | **Modify** | Add optional `hoverPosition` prop to render a circle marker. Add optional `highlightSection` prop for climb highlights. Add polyline click handler via `onPolylineClick`. |
| `src/app/routes/[id]/page.tsx` | **Modify** | Manage shared `hoverIndex` state. Wire `ElevationProfile`, `ClimbCards`, and `MapView` together. Change layout from 2-column to full-width stacked. |
| `vitest.config.ts` | **Create** | Vitest config for unit testing. |
| `src/lib/__tests__/climb-detection.test.ts` | **Create** | Unit tests for all pure functions in climb-detection.ts. |

---

## Chunk 1: Pure Functions & Tests

### Task 1: Set up Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add devDependency + script)

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Add test script to package.json**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify Vitest runs**

```bash
npx vitest run
```
Expected: "No test files found" (success — framework works)

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest for unit testing"
```

---

### Task 2: Extract climb-detection.ts — haversine & smoothing

**Files:**
- Create: `src/lib/climb-detection.ts`
- Create: `src/lib/__tests__/climb-detection.test.ts`

- [ ] **Step 1: Write failing tests for haversine**

Create `src/lib/__tests__/climb-detection.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { haversine, smoothElevations } from "../climb-detection";

describe("haversine", () => {
  it("returns 0 for same point", () => {
    expect(haversine([53.3498, -6.2603], [53.3498, -6.2603])).toBe(0);
  });

  it("calculates Dublin to Cork ≈ 220km", () => {
    const d = haversine([53.3498, -6.2603], [51.8985, -8.4756]);
    expect(d).toBeGreaterThan(210);
    expect(d).toBeLessThan(230);
  });

  it("calculates short distance accurately", () => {
    // ~111m (0.001 degree latitude ≈ 111m)
    const d = haversine([53.35, -6.26], [53.351, -6.26]);
    expect(d).toBeGreaterThan(0.1);
    expect(d).toBeLessThan(0.12);
  });
});

describe("smoothElevations", () => {
  it("returns same array for fewer than 5 points", () => {
    const input = [100, 200, 150];
    expect(smoothElevations(input)).toEqual([100, 200, 150]);
  });

  it("smooths a spike in the middle", () => {
    // A spike at index 3 should be averaged down
    const input = [100, 100, 100, 200, 100, 100, 100];
    const result = smoothElevations(input);
    // The spike should be reduced significantly
    expect(result[3]).toBeLessThan(160);
    expect(result[3]).toBeGreaterThan(100);
  });

  it("preserves endpoints approximately", () => {
    const input = [100, 110, 120, 130, 140, 150, 160];
    const result = smoothElevations(input);
    // First and last should be close to original (asymmetric window)
    expect(Math.abs(result[0] - 100)).toBeLessThan(15);
    expect(Math.abs(result[6] - 160)).toBeLessThan(15);
  });

  it("handles flat terrain", () => {
    const input = [100, 100, 100, 100, 100, 100, 100];
    const result = smoothElevations(input);
    result.forEach((v) => expect(v).toBe(100));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/__tests__/climb-detection.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement haversine and smoothElevations**

Create `src/lib/climb-detection.ts`:

```typescript
// ============================================================
// climb-detection.ts — Pure functions for elevation analysis
// ============================================================

/**
 * Haversine distance in km between two [lat, lng] points.
 */
export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Replace NaN/undefined elevation values with linear interpolation from neighbours.
 * Returns a clean number[] with no NaN values.
 */
export function interpolateNaN(elevations: (number | undefined | null)[]): number[] {
  const result = elevations.map((e) => (e != null && !isNaN(e) ? e : NaN));

  // Forward fill then backward fill for leading/trailing NaNs
  for (let i = 0; i < result.length; i++) {
    if (isNaN(result[i])) {
      // Find previous valid and next valid
      let prev = -1;
      for (let j = i - 1; j >= 0; j--) { if (!isNaN(result[j])) { prev = j; break; } }
      let next = -1;
      for (let j = i + 1; j < result.length; j++) { if (!isNaN(result[j])) { next = j; break; } }

      if (prev >= 0 && next >= 0) {
        // Linear interpolation
        const ratio = (i - prev) / (next - prev);
        result[i] = result[prev] + ratio * (result[next] - result[prev]);
      } else if (prev >= 0) {
        result[i] = result[prev];
      } else if (next >= 0) {
        result[i] = result[next];
      } else {
        result[i] = 0; // All NaN — fallback
      }
    }
  }
  return result;
}

/**
 * Smooth elevation data using a 5-point moving average.
 * Asymmetric window at boundaries.
 */
export function smoothElevations(elevations: number[]): number[] {
  const n = elevations.length;
  if (n < 5) return [...elevations];

  const smoothed: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - 2);
    const end = Math.min(n - 1, i + 2);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= end; j++) {
      sum += elevations[j];
      count++;
    }
    smoothed[i] = sum / count;
  }
  return smoothed;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/climb-detection.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/climb-detection.ts src/lib/__tests__/climb-detection.test.ts
git commit -m "feat: extract haversine and smoothElevations into climb-detection.ts"
```

---

### Task 3: Gradient calculation and colour functions

**Files:**
- Modify: `src/lib/climb-detection.ts`
- Modify: `src/lib/__tests__/climb-detection.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/__tests__/climb-detection.test.ts`:

```typescript
import { computeGradients, gradientColor, CATEGORY_COLORS } from "../climb-detection";

describe("computeGradients", () => {
  it("computes positive gradient for uphill", () => {
    // 100m gain over 1km = 10%
    const elevations = [0, 100];
    const distances = [0, 1]; // km
    const grads = computeGradients(elevations, distances);
    expect(grads[0]).toBeCloseTo(10, 0);
  });

  it("computes negative gradient for downhill", () => {
    const elevations = [100, 0];
    const distances = [0, 1];
    const grads = computeGradients(elevations, distances);
    expect(grads[0]).toBeCloseTo(-10, 0);
  });

  it("returns empty for single point", () => {
    expect(computeGradients([100], [0])).toEqual([]);
  });
});

describe("gradientColor", () => {
  it("returns green for flat/easy gradients", () => {
    expect(gradientColor(0)).toBe("#00ff88");
    expect(gradientColor(2)).toBe("#00ff88");
  });

  it("returns purple for steep gradients", () => {
    expect(gradientColor(12)).toBe("#cc33ff");
  });

  it("returns blue-grey for descents", () => {
    expect(gradientColor(-5)).toBe("#6688aa");
  });
});

describe("CATEGORY_COLORS", () => {
  it("has entries for all categories", () => {
    expect(CATEGORY_COLORS.HC).toBe("#cc33ff");
    expect(CATEGORY_COLORS["Cat 1"]).toBe("#ff5533");
    expect(CATEGORY_COLORS["Cat 2"]).toBe("#ffbb00");
    expect(CATEGORY_COLORS["Cat 3"]).toBe("#bbff00");
    expect(CATEGORY_COLORS["Cat 4"]).toBe("#00ff88");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/__tests__/climb-detection.test.ts
```
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement computeGradients, gradientColor, CATEGORY_COLORS**

Add to `src/lib/climb-detection.ts`:

```typescript
/**
 * Compute gradient (%) between consecutive points.
 * Returns array of length (n-1).
 */
export function computeGradients(elevations: number[], cumulativeDistancesKm: number[]): number[] {
  const gradients: number[] = [];
  for (let i = 1; i < elevations.length; i++) {
    const dElev = elevations[i] - elevations[i - 1];
    const dDist = (cumulativeDistancesKm[i] - cumulativeDistancesKm[i - 1]) * 1000; // to metres
    if (dDist === 0) {
      gradients.push(0);
    } else {
      gradients.push((dElev / dDist) * 100);
    }
  }
  return gradients;
}

/**
 * Colour for a given gradient percentage.
 * Negative gradients (descents) → muted blue-grey.
 * Positive gradients → green → yellow-green → orange → red → purple.
 */
export function gradientColor(pct: number): string {
  if (pct < 0) return "#6688aa";   // descent
  if (pct < 3) return "#00ff88";   // easy green
  if (pct < 5) return "#bbff00";   // moderate yellow-green
  if (pct < 7) return "#ffbb00";   // hard orange
  if (pct < 10) return "#ff5533";  // steep red
  return "#cc33ff";                 // brutal purple
}

/** Category badge colours, matching the gradient scale. */
export const CATEGORY_COLORS: Record<string, string> = {
  HC: "#cc33ff",
  "Cat 1": "#ff5533",
  "Cat 2": "#ffbb00",
  "Cat 3": "#bbff00",
  "Cat 4": "#00ff88",
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/climb-detection.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/climb-detection.ts src/lib/__tests__/climb-detection.test.ts
git commit -m "feat: add gradient calculation and colour functions"
```

---

### Task 4: Climb detection and categorisation

**Files:**
- Modify: `src/lib/climb-detection.ts`
- Modify: `src/lib/__tests__/climb-detection.test.ts`

- [ ] **Step 1: Write failing tests**

Append to test file:

```typescript
import { detectClimbs, categoriseClimb, type Climb } from "../climb-detection";

describe("categoriseClimb", () => {
  it("returns HC for score >= 80", () => {
    expect(categoriseClimb(10, 8.5)).toBe("HC"); // 10 * 8.5 = 85
  });

  it("returns Cat 1 for score 40-79", () => {
    expect(categoriseClimb(8, 6)).toBe("Cat 1"); // 48
  });

  it("returns Cat 2 for score 20-39", () => {
    expect(categoriseClimb(5, 5)).toBe("Cat 2"); // 25
  });

  it("returns Cat 3 for score 8-19", () => {
    expect(categoriseClimb(3, 4)).toBe("Cat 3"); // 12
  });

  it("returns Cat 4 for score 3-7", () => {
    expect(categoriseClimb(1, 4)).toBe("Cat 4"); // 4
  });

  it("returns null for score < 3", () => {
    expect(categoriseClimb(0.5, 3)).toBeNull(); // 1.5
  });
});

describe("detectClimbs", () => {
  it("returns empty for flat terrain", () => {
    const coords: [number, number, number][] = Array.from({ length: 100 }, (_, i) => [
      53.35 + i * 0.001,
      -6.26,
      100,
    ]);
    const climbs = detectClimbs(coords);
    expect(climbs).toEqual([]);
  });

  it("detects a single significant climb", () => {
    // Build a route: 5km flat, then 3km at ~8% (240m gain), then flat
    const coords: [number, number, number][] = [];
    for (let i = 0; i < 200; i++) {
      const km = i * 0.05; // 0.05km per point = 10km total
      let elev = 100;
      if (km >= 2 && km <= 5) {
        elev = 100 + ((km - 2) / 3) * 240; // 240m over 3km = 8%
      } else if (km > 5) {
        elev = 340;
      }
      coords.push([53.35 + i * 0.0005, -6.26, elev]);
    }

    const climbs = detectClimbs(coords);
    expect(climbs.length).toBeGreaterThanOrEqual(1);
    const mainClimb = climbs[0];
    expect(mainClimb.gain).toBeGreaterThan(180); // smoothing may reduce slightly
    expect(mainClimb.category).not.toBeNull();
  });

  it("returns empty for < 5 coordinates", () => {
    const coords: [number, number, number][] = [
      [53.35, -6.26, 100],
      [53.351, -6.26, 200],
    ];
    expect(detectClimbs(coords)).toEqual([]);
  });

  it("filters out climbs with < 30m gain", () => {
    // Build a gentle 20m rise — should be filtered out
    const coords: [number, number, number][] = [];
    for (let i = 0; i < 100; i++) {
      const km = i * 0.05;
      const elev = km < 2 ? 100 : km < 3 ? 100 + ((km - 2) * 20) : 120;
      coords.push([53.35 + i * 0.0005, -6.26, elev]);
    }
    const climbs = detectClimbs(coords);
    expect(climbs).toEqual([]);
  });

  it("orders climbs by start km ascending", () => {
    // Two climbs: one at km 1-3, another at km 5-7
    const coords: [number, number, number][] = [];
    for (let i = 0; i < 200; i++) {
      const km = i * 0.05;
      let elev = 100;
      if (km >= 1 && km <= 3) {
        elev = 100 + ((km - 1) / 2) * 100;
      } else if (km > 3 && km < 5) {
        elev = 200;
      } else if (km >= 5 && km <= 7) {
        elev = 200 + ((km - 5) / 2) * 100;
      } else if (km > 7) {
        elev = 300;
      }
      coords.push([53.35 + i * 0.0005, -6.26, elev]);
    }
    const climbs = detectClimbs(coords);
    if (climbs.length >= 2) {
      expect(climbs[0].startKm).toBeLessThan(climbs[1].startKm);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/__tests__/climb-detection.test.ts
```
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement detectClimbs and categoriseClimb**

Add to `src/lib/climb-detection.ts`:

```typescript
/** A detected climb with stats and category. */
export interface Climb {
  startIndex: number;
  endIndex: number;
  startKm: number;
  endKm: number;
  startElev: number;
  endElev: number;
  gain: number;
  distanceKm: number;
  avgGradient: number;
  maxElev: number;
  category: string | null; // "HC" | "Cat 1" | "Cat 2" | "Cat 3" | "Cat 4" | null
}

/**
 * Categorise a climb by the Strava-style score formula.
 * Score = length_km × avg_gradient_%
 */
export function categoriseClimb(lengthKm: number, avgGradient: number): string | null {
  const score = lengthKm * avgGradient;
  if (score >= 80) return "HC";
  if (score >= 40) return "Cat 1";
  if (score >= 20) return "Cat 2";
  if (score >= 8) return "Cat 3";
  if (score >= 3) return "Cat 4";
  return null;
}

/**
 * Detect significant climbs from coordinate data.
 *
 * @param coordinates Array of [lat, lng, elevation] tuples
 * @returns Array of Climb objects, ordered by start km ascending
 */
export function detectClimbs(coordinates: [number, number, number][]): Climb[] {
  if (coordinates.length < 5) return [];

  const rawElevations = interpolateNaN(coordinates.map((c) => c[2]));
  const smoothed = smoothElevations(rawElevations);

  // Build cumulative distance array
  const cumDist: number[] = [0];
  for (let i = 1; i < coordinates.length; i++) {
    cumDist.push(
      cumDist[i - 1] + haversine([coordinates[i - 1][0], coordinates[i - 1][1]], [coordinates[i][0], coordinates[i][1]])
    );
  }

  const n = smoothed.length;
  const climbs: Climb[] = [];

  // Compute gradients between consecutive smoothed points
  const gradients = computeGradients(smoothed, cumDist);

  let i = 0;
  const CLIMB_START_THRESHOLD = 2; // % gradient to start a climb
  const CLIMB_END_THRESHOLD = 1;   // % gradient to end a climb
  const MIN_CONSECUTIVE_START = 3;  // consecutive points above threshold to start
  const MIN_CONSECUTIVE_END = 5;    // consecutive points below threshold to end

  while (i < n - 1) {
    // Find start of climb: MIN_CONSECUTIVE_START points above CLIMB_START_THRESHOLD
    let consecutiveUp = 0;
    while (i < gradients.length) {
      if (gradients[i] >= CLIMB_START_THRESHOLD) {
        consecutiveUp++;
        if (consecutiveUp >= MIN_CONSECUTIVE_START) {
          i = i - MIN_CONSECUTIVE_START + 1; // back to start of sequence
          break;
        }
      } else {
        consecutiveUp = 0;
      }
      i++;
    }
    if (i >= gradients.length) break;

    const climbStartIdx = i;
    let climbEndIdx = i;
    let peakElev = smoothed[i];
    let peakIdx = i;
    let consecutiveBelow = 0;

    // Walk the climb
    while (i < gradients.length) {
      i++;
      if (smoothed[i] > peakElev) {
        peakElev = smoothed[i];
        peakIdx = i;
      }
      if (gradients[i - 1] < CLIMB_END_THRESHOLD) {
        consecutiveBelow++;
        if (consecutiveBelow >= MIN_CONSECUTIVE_END) {
          climbEndIdx = i - MIN_CONSECUTIVE_END;
          break;
        }
      } else {
        consecutiveBelow = 0;
        climbEndIdx = i;
      }
    }
    if (i >= gradients.length) climbEndIdx = peakIdx;

    // Calculate stats
    const gain = smoothed[climbEndIdx] - smoothed[climbStartIdx];
    const startKm = cumDist[climbStartIdx];
    const endKm = cumDist[climbEndIdx];
    const distKm = endKm - startKm;

    // Filter: min 30m gain, min 2% average, min distance
    if (gain >= 30 && distKm > 0.1) {
      const avgGrad = (gain / (distKm * 1000)) * 100;
      if (avgGrad >= 2) {
        const category = categoriseClimb(distKm, avgGrad);
        climbs.push({
          startIndex: climbStartIdx,
          endIndex: climbEndIdx,
          startKm,
          endKm,
          startElev: smoothed[climbStartIdx],
          endElev: smoothed[climbEndIdx],
          gain,
          distanceKm: distKm,
          avgGradient: avgGrad,
          maxElev: peakElev,
          category,
        });
      }
    }

    i = climbEndIdx + 1;
  }

  // Sort by start km ascending (natural route order)
  climbs.sort((a, b) => a.startKm - b.startKm);

  // Only return categorised climbs (score >= 3)
  return climbs.filter((c) => c.category !== null);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/climb-detection.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/climb-detection.ts src/lib/__tests__/climb-detection.test.ts
git commit -m "feat: add climb detection with HC/Cat categorisation"
```

---

### Task 5: Downsample and tooltip gradient helper

**Files:**
- Modify: `src/lib/climb-detection.ts`
- Modify: `src/lib/__tests__/climb-detection.test.ts`

- [ ] **Step 1: Write failing tests**

Append to test file:

```typescript
import { downsample, tooltipGradient } from "../climb-detection";

describe("downsample", () => {
  it("returns original if under maxPoints", () => {
    const data = [1, 2, 3, 4, 5];
    expect(downsample(data, 10)).toEqual(data);
  });

  it("reduces array size", () => {
    const data = Array.from({ length: 1000 }, (_, i) => Math.sin(i / 100) * 100);
    const result = downsample(data, 200);
    expect(result.length).toBe(200);
  });

  it("preserves first and last values", () => {
    const data = Array.from({ length: 500 }, (_, i) => i);
    const result = downsample(data, 100);
    expect(result[0]).toBe(0);
    expect(result[result.length - 1]).toBe(499);
  });
});

describe("tooltipGradient", () => {
  it("averages over ±3 window", () => {
    // 7 gradients: [2, 2, 2, 10, 2, 2, 2] — middle point should be averaged
    const gradients = [2, 2, 2, 10, 2, 2, 2];
    const result = tooltipGradient(gradients, 3);
    // Average of all 7 = (2*6 + 10) / 7 ≈ 3.14
    expect(result).toBeCloseTo(3.14, 1);
  });

  it("handles edge indices", () => {
    const gradients = [5, 5, 5, 5, 5];
    expect(tooltipGradient(gradients, 0)).toBeCloseTo(5, 1);
    expect(tooltipGradient(gradients, 4)).toBeCloseTo(5, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/__tests__/climb-detection.test.ts
```

- [ ] **Step 3: Implement downsample and tooltipGradient**

Add to `src/lib/climb-detection.ts`:

```typescript
/**
 * Downsample returning the selected indices (not values).
 * Use this when you need to downsample multiple parallel arrays in sync.
 */
export function downsampleIndices(data: number[], maxPoints: number): number[] {
  if (data.length <= maxPoints) return Array.from({ length: data.length }, (_, i) => i);

  const indices: number[] = [0];
  const bucketSize = (data.length - 2) / (maxPoints - 2);

  let prevIndex = 0;
  for (let i = 1; i < maxPoints - 1; i++) {
    const rangeStart = Math.floor((i - 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor(i * bucketSize) + 1, data.length - 1);
    const nextBucketStart = Math.floor(i * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length - 1);

    let avgNext = 0;
    for (let j = nextBucketStart; j <= nextBucketEnd; j++) avgNext += data[j];
    avgNext /= nextBucketEnd - nextBucketStart + 1;

    let maxArea = -1;
    let bestIdx = rangeStart;
    for (let j = rangeStart; j <= rangeEnd; j++) {
      const area = Math.abs(
        (prevIndex - (nextBucketStart + nextBucketEnd) / 2) * (data[j] - data[prevIndex]) -
        (prevIndex - j) * (avgNext - data[prevIndex])
      );
      if (area > maxArea) {
        maxArea = area;
        bestIdx = j;
      }
    }

    indices.push(bestIdx);
    prevIndex = bestIdx;
  }

  indices.push(data.length - 1);
  return indices;
}

/**
 * Downsample an array to at most `maxPoints` using largest-triangle-three-buckets.
 */
export function downsample(data: number[], maxPoints: number): number[] {
  if (data.length <= maxPoints) return data;

  const sampled: number[] = [data[0]];
  const bucketSize = (data.length - 2) / (maxPoints - 2);

  let prevIndex = 0;
  for (let i = 1; i < maxPoints - 1; i++) {
    const rangeStart = Math.floor((i - 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor(i * bucketSize) + 1, data.length - 1);
    const nextBucketStart = Math.floor(i * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length - 1);

    let avgNext = 0;
    for (let j = nextBucketStart; j <= nextBucketEnd; j++) avgNext += data[j];
    avgNext /= nextBucketEnd - nextBucketStart + 1;

    let maxArea = -1;
    let bestIdx = rangeStart;
    for (let j = rangeStart; j <= rangeEnd; j++) {
      const area = Math.abs(
        (prevIndex - (nextBucketStart + nextBucketEnd) / 2) * (data[j] - data[prevIndex]) -
        (prevIndex - j) * (avgNext - data[prevIndex])
      );
      if (area > maxArea) {
        maxArea = area;
        bestIdx = j;
      }
    }

    sampled.push(data[bestIdx]);
    prevIndex = bestIdx;
  }

  sampled.push(data[data.length - 1]);
  return sampled;
}

/**
 * Compute a smoothed gradient for tooltip display.
 * Averages over a ±3 point window around the target index.
 */
export function tooltipGradient(gradients: number[], index: number): number {
  const WINDOW = 3;
  const start = Math.max(0, index - WINDOW);
  const end = Math.min(gradients.length - 1, index + WINDOW);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= end; i++) {
    sum += gradients[i];
    count++;
  }
  return count > 0 ? sum / count : 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/climb-detection.test.ts
```
Expected: PASS

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/climb-detection.ts src/lib/__tests__/climb-detection.test.ts
git commit -m "feat: add downsample and tooltip gradient helpers"
```

---

## Chunk 2: UI Components

### Task 6: Rewrite ElevationProfile.tsx — gradient-coloured canvas

**Files:**
- Rewrite: `src/components/ElevationProfile.tsx`

This is a full rewrite. The new component:
1. Imports pure functions from `src/lib/climb-detection.ts`
2. Renders gradient-coloured line segments on canvas
3. Gradient fill beneath each segment
4. Desktop hover + mobile touch tooltip (with gradient %)
5. Gradient legend below chart
6. Accepts `onPositionChange(index: number | null)` and `highlightIndex: number | null` props
7. No longer contains climb detection/display (moved to ClimbCards)

- [ ] **Step 1: Rewrite ElevationProfile.tsx**

Replace the entire contents of `src/components/ElevationProfile.tsx` with the new implementation.

Key changes from current code:
- **Props change:** Add `onPositionChange?: (index: number | null) => void` and `highlightIndex?: number | null`. Remove `elevationGain`/`elevationLoss` (no longer shown here — they're in the stats row). Keep `coordinates` as `[number, number, number][]` (was `[number, number][]`).
- **Canvas rendering:** Instead of a single green line, draw individual line segments coloured by `gradientColor()` of the local gradient. Fill beneath each segment pair with the line colour at 15% opacity fading to transparent.
- **Tooltip:** Add `touchstart`/`touchmove`/`touchend` handlers alongside existing `mousemove`. Tooltip now shows gradient % in addition to elevation and distance. Use `tooltipGradient()` for the displayed gradient value.
- **Highlight crosshair:** When `highlightIndex` is set, draw a vertical dashed line at that x-position.
- **Gradient legend:** Below the canvas, render a compact row of coloured blocks with labels: "0-3%", "3-5%", "5-7%", "7-10%", "10%+", plus the descent blue-grey.
- **Remove:** All climb detection code (moved to `climb-detection.ts`), the climb table, the `climbsOpen` state, the gain/loss stats row.

```typescript
"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import {
  haversine,
  interpolateNaN,
  smoothElevations,
  computeGradients,
  gradientColor,
  tooltipGradient,
  downsampleIndices,
} from "@/lib/climb-detection";

interface ElevationProfileProps {
  coordinates: [number, number, number][];
  distanceKm: number;
  onPositionChange?: (index: number | null) => void;
  highlightIndex?: number | null;
}

const GRADIENT_LEGEND = [
  { label: "0-3%", color: "#00ff88" },
  { label: "3-5%", color: "#bbff00" },
  { label: "5-7%", color: "#ffbb00" },
  { label: "7-10%", color: "#ff5533" },
  { label: "10%+", color: "#cc33ff" },
  { label: "Descent", color: "#6688aa" },
];

export default function ElevationProfile({
  coordinates,
  distanceKm,
  onPositionChange,
  highlightIndex,
}: ElevationProfileProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    elevation: number;
    distance: number;
    gradient: number;
  } | null>(null);

  const rawElevations = useMemo(() => interpolateNaN(coordinates.map((c) => c[2])), [coordinates]);
  const hasRealData = rawElevations.length > 0 && rawElevations.some((e) => e !== 0);

  // Smooth, downsample, compute distances and gradients
  const chartData = useMemo(() => {
    if (!hasRealData || coordinates.length < 2) {
      return null;
    }

    const smoothed = smoothElevations(rawElevations);

    // Build cumulative distances from original coordinates
    const cumDist: number[] = [0];
    for (let i = 1; i < coordinates.length; i++) {
      cumDist.push(
        cumDist[i - 1] +
          haversine([coordinates[i - 1][0], coordinates[i - 1][1]], [coordinates[i][0], coordinates[i][1]])
      );
    }

    // Downsample using indices to keep elevation/distance arrays in sync
    const indices = downsampleIndices(smoothed, 600);
    const sampled = indices.map((idx) => smoothed[idx]);
    const sampledCumDist = indices.map((idx) => cumDist[idx]);
    const gradients = computeGradients(sampled, sampledCumDist);

    return { elevations: sampled, cumDist: sampledCumDist, gradients, indices };
  }, [coordinates, rawElevations, hasRealData]);

  // Draw the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chartData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { elevations, gradients } = chartData;
    if (elevations.length < 2) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 16, right: 12, bottom: 28, left: 44 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const minElev = Math.min(...elevations);
    const maxElev = Math.max(...elevations);
    const elevPadding = (maxElev - minElev) * 0.05 || 10;
    const rangeMin = Math.max(0, minElev - elevPadding);
    const rangeMax = maxElev + elevPadding;
    const elevRange = rangeMax - rangeMin || 1;

    ctx.clearRect(0, 0, width, height);

    const toX = (i: number) => padding.left + (i / (elevations.length - 1)) * plotWidth;
    const toY = (elev: number) => padding.top + plotHeight - ((elev - rangeMin) / elevRange) * plotHeight;

    // Grid lines
    const niceStep = niceElevationStep(elevRange);
    const gridStart = Math.ceil(rangeMin / niceStep) * niceStep;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "10px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "right";

    for (let elev = gridStart; elev <= rangeMax; elev += niceStep) {
      const y = toY(elev);
      if (y < padding.top || y > height - padding.bottom) continue;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillText(`${Math.round(elev)}m`, padding.left - 6, y + 3);
    }

    // X-axis labels
    ctx.textAlign = "center";
    const distStep = niceDistanceStep(distanceKm);
    for (let d = 0; d <= distanceKm; d += distStep) {
      const x = padding.left + (d / distanceKm) * plotWidth;
      if (x < padding.left || x > width - padding.right) continue;
      ctx.fillText(`${Math.round(d)}`, x, height - padding.bottom + 14);
    }
    ctx.fillText("km", width - padding.right, height - padding.bottom + 14);

    // Draw gradient-coloured fill + line segments
    for (let i = 0; i < elevations.length - 1; i++) {
      const x1 = toX(i);
      const x2 = toX(i + 1);
      const y1 = toY(elevations[i]);
      const y2 = toY(elevations[i + 1]);
      const color = gradientColor(gradients[i] ?? 0);

      // Fill beneath this segment
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2, height - padding.bottom);
      ctx.lineTo(x1, height - padding.bottom);
      ctx.closePath();
      const fillGrad = ctx.createLinearGradient(0, Math.min(y1, y2), 0, height - padding.bottom);
      fillGrad.addColorStop(0, color + "26"); // 15% opacity
      fillGrad.addColorStop(1, color + "03"); // ~1% opacity
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // Line segment
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    }

    // Highlight crosshair from map sync
    if (highlightIndex != null && highlightIndex >= 0 && highlightIndex < coordinates.length) {
      // Map highlightIndex from original coordinates space to sampled space
      const ratio = highlightIndex / (coordinates.length - 1);
      const sampledIdx = Math.round(ratio * (elevations.length - 1));
      const hx = toX(sampledIdx);

      ctx.beginPath();
      ctx.moveTo(hx, padding.top);
      ctx.lineTo(hx, height - padding.bottom);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dot on the line
      const hy = toY(elevations[sampledIdx]);
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }
  }, [chartData, distanceKm, highlightIndex, coordinates.length]);

  // Hover/touch handler
  const handleInteraction = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !chartData) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = clientX - rect.left;
      const pad = { left: 44, right: 12 };
      const plotWidth = rect.width - pad.left - pad.right;
      const ratio = Math.max(0, Math.min(1, (mouseX - pad.left) / plotWidth));
      const idx = Math.round(ratio * (chartData.elevations.length - 1));

      const elevation = chartData.elevations[idx];
      const distance = ratio * distanceKm;
      const gradient = tooltipGradient(chartData.gradients, idx);

      setTooltip({ x: mouseX, y: clientY - rect.top, elevation, distance, gradient });

      // Map the sampled index back to original coordinates index
      if (onPositionChange) {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const originalIdx = Math.round(ratio * (coordinates.length - 1));
          onPositionChange(originalIdx);
        });
      }
    },
    [chartData, distanceKm, onPositionChange, coordinates.length]
  );

  const handleMouseMove = (e: React.MouseEvent) => handleInteraction(e.clientX, e.clientY);

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault(); // prevent scroll while scrubbing
    const touch = e.touches[0];
    handleInteraction(touch.clientX, touch.clientY);
  };

  const handleLeave = () => {
    setTooltip(null);
    onPositionChange?.(null);
  };

  if (!hasRealData) {
    return (
      <div
        className="text-sm text-center py-8 rounded-lg"
        style={{ color: "var(--text-muted)", background: "var(--bg-raised)" }}
      >
        No elevation data available
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: "200px", cursor: "crosshair", touchAction: "none" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleLeave}
          onTouchStart={(e) => handleTouchMove(e)}
          onTouchMove={(e) => handleTouchMove(e)}
          onTouchEnd={handleLeave}
        />
        {tooltip && (
          <div
            className="absolute pointer-events-none z-10 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
            style={{
              left: Math.min(tooltip.x, (containerRef.current?.offsetWidth ?? 300) - 140),
              top: Math.max(0, tooltip.y - 48),
              background: "rgba(0,0,0,0.85)",
              border: "1px solid rgba(200,255,0,0.3)",
              color: "var(--text)",
              backdropFilter: "blur(8px)",
            }}
          >
            <span style={{ color: "#c8ff00" }}>{Math.round(tooltip.elevation)}m</span>
            <span style={{ color: "var(--text-muted)" }}> · {tooltip.distance.toFixed(1)} km</span>
            <span style={{ color: gradientColor(tooltip.gradient) }}>
              {" "}
              · {tooltip.gradient >= 0 ? "+" : ""}
              {tooltip.gradient.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* Gradient Legend */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {GRADIENT_LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div className="w-3 h-2 rounded-sm" style={{ background: item.color }} />
            <span className="text-[9px] font-medium" style={{ color: "var(--text-muted)" }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Axis helpers (kept local, not worth extracting) ---

function niceElevationStep(range: number): number {
  const rawStep = range / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function niceDistanceStep(totalKm: number): number {
  if (totalKm <= 20) return 5;
  if (totalKm <= 50) return 10;
  if (totalKm <= 100) return 20;
  if (totalKm <= 200) return 50;
  if (totalKm <= 500) return 100;
  return 200;
}
```

- [ ] **Step 2: Verify the dev server compiles without errors**

```bash
npx next build --no-lint 2>&1 | head -20
```
Expected: Build succeeds (may have unused import warnings, that's fine)

Note: The route detail page will temporarily break because the ElevationProfile props changed. This is expected and fixed in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/components/ElevationProfile.tsx
git commit -m "feat: rewrite ElevationProfile with gradient-coloured canvas and touch support"
```

---

### Task 7: Create ClimbCards.tsx

**Files:**
- Create: `src/components/ClimbCards.tsx`

- [ ] **Step 1: Create ClimbCards component**

Create `src/components/ClimbCards.tsx`:

```typescript
"use client";

import { CATEGORY_COLORS, type Climb } from "@/lib/climb-detection";

interface ClimbCardsProps {
  climbs: Climb[];
  onClimbSelect?: (climb: Climb) => void;
}

export default function ClimbCards({ climbs, onClimbSelect }: ClimbCardsProps) {
  if (climbs.length === 0) return null;

  // Build summary: count by category
  const categoryCounts: Record<string, number> = {};
  climbs.forEach((c) => {
    if (c.category) {
      categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
    }
  });

  const summaryParts = Object.entries(categoryCounts)
    .sort(([a], [b]) => {
      const order = ["HC", "Cat 1", "Cat 2", "Cat 3", "Cat 4"];
      return order.indexOf(a) - order.indexOf(b);
    })
    .map(([cat, count]) => `${count} ${cat}`);

  return (
    <div>
      {/* Summary header */}
      <div className="flex items-center gap-2 mb-3">
        <svg
          className="w-4 h-4 shrink-0"
          style={{ color: "var(--warning)" }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        <h3
          className="text-xs font-extrabold uppercase tracking-wider"
          style={{ color: "var(--text-secondary)" }}
        >
          {climbs.length} {climbs.length === 1 ? "Climb" : "Climbs"}
        </h3>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {summaryParts.join(", ")}
        </span>
      </div>

      {/* Climb cards */}
      <div className="grid gap-2">
        {climbs.map((climb, i) => {
          const color = climb.category ? CATEGORY_COLORS[climb.category] ?? "var(--text-muted)" : "var(--text-muted)";

          return (
            <button
              key={i}
              onClick={() => onClimbSelect?.(climb)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: `${color}26`, // 15% opacity
                border: `1px solid ${color}40`, // 25% opacity
              }}
            >
              {/* Category badge */}
              <div
                className="shrink-0 w-12 h-12 rounded-lg flex flex-col items-center justify-center"
                style={{
                  background: `${color}26`, // 15% opacity
                  border: `1px solid ${color}40`, // 25% opacity
                }}
              >
                <span
                  className="text-[10px] font-extrabold uppercase tracking-wider leading-none"
                  style={{ color }}
                >
                  {climb.category}
                </span>
              </div>

              {/* Climb info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-bold" style={{ color: "var(--text)" }}>
                    km {climb.startKm.toFixed(1)} → {climb.endKm.toFixed(1)}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    ({climb.distanceKm.toFixed(1)} km)
                  </span>
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {Math.round(climb.startElev)}m → {Math.round(climb.endElev)}m · +{Math.round(climb.gain)}m
                </div>
              </div>

              {/* Gradient % — large and prominent */}
              <div className="shrink-0 text-right">
                <div className="text-lg font-extrabold leading-none" style={{ color }}>
                  {climb.avgGradient.toFixed(1)}%
                </div>
                <div className="text-[9px] uppercase tracking-wider font-bold mt-0.5" style={{ color: "var(--text-muted)" }}>
                  avg
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify component compiles**

```bash
npx next build --no-lint 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ClimbCards.tsx
git commit -m "feat: add ClimbCards component with HC/Cat badges"
```

---

### Task 8: Update MapView.tsx — hover position marker and polyline click

**Files:**
- Modify: `src/components/MapView.tsx`

- [ ] **Step 1: Add hoverPosition, highlightSection, and onPolylineClick props**

Add to the MapView component's props:

```typescript
hoverPosition?: { lat: number; lng: number } | null;
highlightSection?: { coords: [number, number][]; color: string } | null;
onPolylineClick?: (latlng: { lat: number; lng: number }) => void;
```

- [ ] **Step 2: Add hover marker effect**

Add a new `useEffect` that renders/removes a circle marker when `hoverPosition` changes:

```typescript
const hoverMarkerRef = useRef<L.CircleMarker | null>(null);

useEffect(() => {
  if (!mapRef.current) return;

  // Remove old marker
  if (hoverMarkerRef.current) {
    hoverMarkerRef.current.remove();
    hoverMarkerRef.current = null;
  }

  if (hoverPosition) {
    hoverMarkerRef.current = L.circleMarker([hoverPosition.lat, hoverPosition.lng], {
      radius: 6,
      fillColor: "#c8ff00",
      color: "#0a0a0a",
      weight: 2,
      fillOpacity: 1,
    }).addTo(mapRef.current);
  }
}, [hoverPosition]);
```

- [ ] **Step 3: Add highlight section effect**

Add a `useEffect` for `highlightSection` that draws a thicker polyline over the climb section:

```typescript
const highlightLayerRef = useRef<L.Polyline | null>(null);

useEffect(() => {
  if (!mapRef.current) return;

  if (highlightLayerRef.current) {
    highlightLayerRef.current.remove();
    highlightLayerRef.current = null;
  }

  if (highlightSection) {
    highlightLayerRef.current = L.polyline(highlightSection.coords, {
      color: highlightSection.color,
      weight: 5,
      opacity: 1,
    }).addTo(mapRef.current);

    mapRef.current.fitBounds(L.latLngBounds(highlightSection.coords), {
      padding: [60, 60],
      maxZoom: 14,
    });
  }
}, [highlightSection]);
```

- [ ] **Step 4: Add polyline click handler**

In the existing route rendering `useEffect`, add a click handler to the polyline:

```typescript
if (onPolylineClick) {
  polyline.on("click", (e: L.LeafletMouseEvent) => {
    onPolylineClick({ lat: e.latlng.lat, lng: e.latlng.lng });
  });
}
```

- [ ] **Step 5: Add cleanup for new refs in the map removal effect**

Update the cleanup in the initial `useEffect`:

```typescript
return () => {
  hoverMarkerRef.current?.remove();
  highlightLayerRef.current?.remove();
  mapRef.current?.remove();
  mapRef.current = null;
};
```

- [ ] **Step 6: Verify MapView compiles**

```bash
npx next build --no-lint 2>&1 | head -20
```

- [ ] **Step 7: Commit**

```bash
git add src/components/MapView.tsx
git commit -m "feat: add hover marker, highlight section, and polyline click to MapView"
```

---

## Chunk 3: Integration & Layout

### Task 9: Wire everything together in routes/[id]/page.tsx

**Files:**
- Modify: `src/app/routes/[id]/page.tsx`

This task changes the route detail page to:
1. Import `ClimbCards` and `detectClimbs` from `climb-detection.ts`
2. Manage `hoverIndex` state for map ↔ profile sync
3. Manage `highlightSection` state for climb card → map zoom
4. Change layout from 2-column `grid md:grid-cols-2` to full-width stacked
5. Add `ClimbCards` section between elevation profile and description
6. Pass new props to `MapView` and `ElevationProfile`

- [ ] **Step 1: Add imports**

Add at top of file:

```typescript
import ClimbCards from "@/components/ClimbCards";
import { detectClimbs, haversine, CATEGORY_COLORS, type Climb } from "@/lib/climb-detection";
```

- [ ] **Step 2: Add state and helper for map sync**

After existing state declarations, add:

```typescript
// Profile hover → map marker (set by profile, drives map)
const [hoverIndex, setHoverIndex] = useState<number | null>(null);
// Map click → profile crosshair (set by map click, drives profile)
const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
// Climb card → map highlight section
const [highlightSection, setHighlightSection] = useState<{
  coords: [number, number][];
  color: string;
} | null>(null);
```

- [ ] **Step 3: Compute full coordinates array and climbs**

After `const elevations = ...` line, change `coordinates` to include elevation and compute climbs:

```typescript
const fullCoordinates: [number, number, number][] = rawCoords.map((c) => [c[0], c[1], c[2] ?? 0]);
const coordinates: [number, number][] = rawCoords.map((c) => [c[0], c[1]]);
const elevations: number[] = rawCoords.map((c) => c[2] ?? 0);
const climbs = detectClimbs(fullCoordinates);
```

- [ ] **Step 4: Add handler functions**

```typescript
const handlePositionChange = (index: number | null) => {
  setHoverIndex(index);
  // Clear map-to-profile crosshair when user starts hovering profile
  if (index != null) setHighlightIndex(null);
};

const handleClimbSelect = (climb: Climb) => {
  const sectionCoords = fullCoordinates
    .slice(climb.startIndex, climb.endIndex + 1)
    .map((c): [number, number] => [c[0], c[1]]);
  const color = climb.category ? CATEGORY_COLORS[climb.category] ?? "#c8ff00" : "#c8ff00";
  setHighlightSection({ coords: sectionCoords, color });
};

const handlePolylineClick = (latlng: { lat: number; lng: number }) => {
  // Find nearest coordinate index — drives profile crosshair (separate from hover)
  let minDist = Infinity;
  let nearestIdx = 0;
  for (let i = 0; i < fullCoordinates.length; i++) {
    const d = haversine([fullCoordinates[i][0], fullCoordinates[i][1]], [latlng.lat, latlng.lng]);
    if (d < minDist) {
      minDist = d;
      nearestIdx = i;
    }
  }
  setHighlightIndex(nearestIdx);
};

// Compute hover position for map marker (from profile hover only)
const hoverPosition = hoverIndex != null && hoverIndex < fullCoordinates.length
  ? { lat: fullCoordinates[hoverIndex][0], lng: fullCoordinates[hoverIndex][1] }
  : null;
```

- [ ] **Step 5: Update MapView to pass new props**

Change the `<MapView>` call to include new props:

```tsx
<MapView
  routes={[route]}
  selectedRouteId={route.id}
  windOverlay={windOverlayEnabled && windData ? windData : null}
  travelOverlay={travelOverlayEnabled}
  hoverPosition={hoverPosition}
  highlightSection={highlightSection}
  onPolylineClick={handlePolylineClick}
/>
```

- [ ] **Step 6: Restructure the layout — replace 2-column grid with stacked full-width**

Replace the current `{/* Description & Elevation */}` section (the `grid md:grid-cols-2` block) with:

```tsx
{/* Elevation Profile — full width */}
<div className="rounded-2xl p-4 md:p-6 mb-3 md:mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
  <h2 className="text-xs font-extrabold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
    Elevation Profile
  </h2>
  <ElevationProfile
    coordinates={fullCoordinates}
    distanceKm={route.distance_km}
    onPositionChange={handlePositionChange}
    highlightIndex={highlightIndex}
  />
</div>

{/* Climb Cards */}
{climbs.length > 0 && (
  <div className="rounded-2xl p-4 md:p-6 mb-3 md:mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
    <ClimbCards climbs={climbs} onClimbSelect={handleClimbSelect} />
  </div>
)}

{/* About this route — full width */}
<div className="rounded-2xl p-4 md:p-6 mb-3 md:mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
  <h2 className="text-xs font-extrabold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
    About this route
  </h2>
  {route.description ? (
    <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{route.description}</p>
  ) : (
    <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>No description provided</p>
  )}
</div>
```

- [ ] **Step 7: Verify dev server compiles and page renders**

```bash
npm run dev
```
Navigate to a route detail page and verify:
- Gradient-coloured elevation profile renders
- Tooltip shows elevation, distance, gradient %
- Touch works on mobile (use Chrome DevTools device mode)
- Climb cards appear below elevation profile
- Clicking a climb card zooms the map
- Hovering the profile shows a marker on the map

- [ ] **Step 8: Commit**

```bash
git add src/app/routes/[id]/page.tsx
git commit -m "feat: integrate elevation profile, climb cards, and map sync on route detail page"
```

---

### Task 10: Dismiss map highlight on map click

**Files:**
- Modify: `src/components/MapView.tsx`

- [ ] **Step 1: Add map click handler to dismiss highlight**

Accept an `onMapClick` prop. Use a ref to avoid stale closures (the map `useEffect` runs once, but the callback may change):

Add to props:
```typescript
onMapClick?: () => void;
```

Add a ref to track the latest callback:
```typescript
const onMapClickRef = useRef(onMapClick);
useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
```

In the initial `useEffect` after map creation (runs once):
```typescript
mapRef.current.on("click", () => {
  onMapClickRef.current?.();
});
```

- [ ] **Step 2: Wire onMapClick in route detail page**

In `routes/[id]/page.tsx`, pass:
```tsx
onMapClick={() => setHighlightSection(null)}
```

- [ ] **Step 3: Verify highlight dismisses on map click**

Click a climb card → map zooms and highlights. Click on the map → highlight disappears.

- [ ] **Step 4: Commit**

```bash
git add src/components/MapView.tsx src/app/routes/[id]/page.tsx
git commit -m "feat: dismiss climb highlight on map click"
```

---

### Task 11: Final verification and cleanup

- [ ] **Step 1: Run all unit tests**

```bash
npx vitest run
```
Expected: All tests pass

- [ ] **Step 2: Run the build**

```bash
npm run build
```
Expected: Build succeeds

- [ ] **Step 3: Manual verification checklist**

Run `npm run dev` and check:
- [ ] Gradient-coloured profile renders on a route with elevation data
- [ ] Descent sections show blue-grey
- [ ] Tooltip shows elevation, distance, gradient % on desktop hover
- [ ] Touch scrubbing works on mobile (Chrome DevTools device mode)
- [ ] Gradient legend displays below chart
- [ ] Climb cards show with HC/Cat badges, correct colours
- [ ] Climb summary header shows correct count and breakdown
- [ ] Clicking a climb card zooms map to that section with coloured highlight
- [ ] Clicking the map dismisses the climb highlight
- [ ] Hovering profile shows a marker moving on the map
- [ ] Clicking the route polyline on the map shows crosshair on profile
- [ ] Routes with no elevation data show "No elevation data available"
- [ ] Layout is full-width stacked (no 2-column grid)

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final elevation profile overhaul polish"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Set up Vitest | `vitest.config.ts`, `package.json` |
| 2 | Extract haversine + smoothing | `src/lib/climb-detection.ts`, tests |
| 3 | Gradient calc + colours | `src/lib/climb-detection.ts`, tests |
| 4 | Climb detection + categorisation | `src/lib/climb-detection.ts`, tests |
| 5 | Downsample + tooltip gradient | `src/lib/climb-detection.ts`, tests |
| 6 | Rewrite ElevationProfile | `src/components/ElevationProfile.tsx` |
| 7 | Create ClimbCards | `src/components/ClimbCards.tsx` |
| 8 | Update MapView | `src/components/MapView.tsx` |
| 9 | Wire everything in route page | `src/app/routes/[id]/page.tsx` |
| 10 | Map click dismiss | `MapView.tsx`, `page.tsx` |
| 11 | Final verification | All files |
