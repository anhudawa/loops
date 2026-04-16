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
});
