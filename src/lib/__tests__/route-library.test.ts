import { describe, it, expect } from "vitest";
import { scoreLibraryRoute, LIBRARY_MATCH_THRESHOLD } from "../route-library";
import type { RouteSpec } from "../route-intent";
import type { Route } from "../db";

function makeSpec(overrides: Partial<RouteSpec> = {}): RouteSpec {
  return {
    distance_km: 50,
    distance_tolerance_km: 5,
    elevation_preference: "rolling",
    discipline: "road",
    start_point: [53.35, -6.26],  // Dublin
    end_point: [53.35, -6.26],
    is_loop: true,
    road_preferences: ["tertiary", "unclassified"],
    avoid: ["motorway"],
    vibes: [],
    country: "Ireland",
    ...overrides,
  };
}

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: "r1",
    name: "Test Route",
    description: null,
    distance_km: 50,
    elevation_gain_m: 500,
    elevation_loss_m: 500,
    surface_type: "road",
    county: "Dublin",
    country: "Ireland",
    region: "Dublin",
    discipline: "road",
    start_lat: 53.35,
    start_lng: -6.26,
    gpx_filename: null,
    coordinates: "[]",
    created_by: null,
    created_at: new Date().toISOString(),
    strava_activity_id: null,
    quality_status: "approved",
    operator_name: null,
    operator_url: null,
    ...overrides,
  };
}

describe("scoreLibraryRoute", () => {
  it("scores a perfect match at or near 100", () => {
    const score = scoreLibraryRoute(makeRoute(), makeSpec(), 0);
    expect(score).toBeGreaterThanOrEqual(95);
  });

  it("penalises distance mismatch beyond tolerance", () => {
    const route = makeRoute({ distance_km: 80 });  // 30km over, tol 5km
    const score = scoreLibraryRoute(route, makeSpec(), 0);
    expect(score).toBeLessThan(LIBRARY_MATCH_THRESHOLD);
  });

  it("accepts distance within tolerance", () => {
    const route = makeRoute({ distance_km: 53 });  // 3km over, within 5km tol
    const score = scoreLibraryRoute(route, makeSpec(), 0);
    expect(score).toBeGreaterThanOrEqual(95);
  });

  it("penalises exceeding max_elevation_gain_m", () => {
    const spec = makeSpec({ max_elevation_gain_m: 300 });
    const route = makeRoute({ elevation_gain_m: 900 }); // 3x the cap
    const score = scoreLibraryRoute(route, spec, 0);
    expect(score).toBeLessThan(LIBRARY_MATCH_THRESHOLD);
  });

  it("penalises distance from requested start", () => {
    const nearScore = scoreLibraryRoute(makeRoute(), makeSpec(), 5);
    const farScore = scoreLibraryRoute(makeRoute(), makeSpec(), 35);
    expect(farScore).toBeLessThan(nearScore);
  });

  it("a route 40km away from start with perfect distance still passes threshold only marginally", () => {
    // 40km = edge of PROXIMITY_RADIUS_KM; should lose ~20 points
    const score = scoreLibraryRoute(makeRoute(), makeSpec(), 40);
    expect(score).toBeLessThanOrEqual(80);
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it("soft-penalises elevation mismatch when no max_elevation_gain_m is set", () => {
    // Spec says 'flat' but no hard cap → soft penalty for a hilly route
    const spec = makeSpec({ elevation_preference: "flat", max_elevation_gain_m: undefined });
    const flatRoute = makeRoute({ elevation_gain_m: 100 });  // 2 m/km — flat
    const hillyRoute = makeRoute({ elevation_gain_m: 800 }); // 16 m/km — hilly
    const flatScore = scoreLibraryRoute(flatRoute, spec, 0);
    const hillyScore = scoreLibraryRoute(hillyRoute, spec, 0);
    expect(hillyScore).toBeLessThan(flatScore);
  });

  it("rewards a mountain route for a 'hilly' prompt vs a flat one", () => {
    const spec = makeSpec({ elevation_preference: "hilly", max_elevation_gain_m: undefined });
    const flatRoute = makeRoute({ elevation_gain_m: 100 });  // 2 m/km — too flat
    const hillyRoute = makeRoute({ elevation_gain_m: 800 }); // 16 m/km — matches
    const flatScore = scoreLibraryRoute(flatRoute, spec, 0);
    const hillyScore = scoreLibraryRoute(hillyRoute, spec, 0);
    expect(hillyScore).toBeGreaterThan(flatScore);
  });

  it("clamps score into [0, 100] even for catastrophic mismatches", () => {
    const spec = makeSpec({ distance_km: 30, max_elevation_gain_m: 100 });
    const awful = makeRoute({ distance_km: 200, elevation_gain_m: 3000 });
    const score = scoreLibraryRoute(awful, spec, 100);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
