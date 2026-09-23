/**
 * routeLoopCandidate against a FAKE routing engine: every `fetch` to the
 * engine is answered locally with straight-line legs between the via points
 * (plus per-leg road tags), so the engine-call pattern of the loop router
 * can be asserted exactly — which searches it runs, and which it skips.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// Module-level constants read the engine wiring at import time.
vi.stubEnv("BROUTER_URL", "http://engine.test/brouter");
vi.stubEnv("BROUTER_THREADS", "4");
delete process.env.BROUTER_ROAD_PROFILE;
delete process.env.BROUTER_ROAD_RELAXED_PROFILE;

type P = [number, number]; // [lat, lng]

const START: P = [39.7657, 2.7147];
const R_KM = 80 / 3; // the generator's loop radius for an 80 km ask

function haversineKm(a: P, b: P): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function destination(a: P, bearing: number, distKm: number): P {
  const R = 6371, d = distKm / R, b = (bearing * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180, lon1 = (a[1] * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}
/** The generator's diamond: start → mid1 (0.55 R, −30°) → far (R) → mid2 (0.55 R, +30°) → start. */
function diamond(bearing: number): P[] {
  return [
    START,
    destination(START, bearing - 30, R_KM * 0.55),
    destination(START, bearing, R_KM),
    destination(START, bearing + 30, R_KM * 0.55),
    START,
  ];
}

// ── Fake engine ─────────────────────────────────────────────────────────────

interface EngineCall { profile: string; waypoints: P[]; lonlats: string }
const calls: EngineCall[] = [];

/** Test-controlled behaviour. */
const engine = {
  /** Strict profile answers "no track found" for these waypoints. */
  strictNoRoute: (_wps: P[]) => false,
  /** Way tags for the edge `kmIntoLeg` km into leg `leg` of a request. */
  tags: (_leg: number, _kmIntoLeg: number): string => "highway=tertiary surface=asphalt maxspeed=50",
};

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

function buildGeojson(wps: P[]): string {
  const coords: [number, number, number][] = [];
  const rows: unknown[][] = [];
  let lastTags = "";
  const pushRow = (p: [number, number, number], tags: string) =>
    rows.push([String(Math.round(p[0] * 1e6)), String(Math.round(p[1] * 1e6)), "100", "50", "1000", "0", "0", "0", "0", tags, "", "5", "100"]);
  for (let leg = 0; leg + 1 < wps.length; leg++) {
    const a = wps[leg], b = wps[leg + 1];
    const legKm = haversineKm(a, b);
    const steps = Math.max(1, Math.round((legKm * 1000) / 50));
    for (let s = leg === 0 ? 0 : 1; s <= steps; s++) {
      const f = s / steps;
      const p: [number, number, number] = [round6(a[1] + (b[1] - a[1]) * f), round6(a[0] + (b[0] - a[0]) * f), 100]; // [lng, lat, ele]
      const tags = engine.tags(leg, legKm * f);
      // A message row marks the END of a run of edges sharing tags.
      if (coords.length > 0 && tags !== lastTags && lastTags) pushRow(coords[coords.length - 1], lastTags);
      coords.push(p);
      lastTags = tags;
    }
  }
  pushRow(coords[coords.length - 1], lastTags);
  let lengthM = 0;
  for (let i = 1; i < coords.length; i++) lengthM += haversineKm([coords[i - 1][1], coords[i - 1][0]], [coords[i][1], coords[i][0]]) * 1000;
  const header = ["Longitude", "Latitude", "Elevation", "Distance", "CostPerKm", "ElevCost", "TurnCost", "NodeCost", "InitialCost", "WayTags", "NodeTags", "Time", "Energy"];
  return JSON.stringify({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { "track-length": String(Math.round(lengthM)), "filtered ascend": "0", "plain-ascend": "0", name: "fake", messages: [header, ...rows] },
      geometry: { type: "LineString", coordinates: coords },
    }],
  });
}

const fakeFetch = vi.fn(async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (!url.href.startsWith("http://engine.test/brouter")) {
    return new Response("Service Unavailable", { status: 503 });
  }
  const profile = url.searchParams.get("profile") ?? "";
  const lonlats = url.searchParams.get("lonlats") ?? "";
  const waypoints: P[] = lonlats.split("|").map((s) => { const [lng, lat] = s.split(",").map(Number); return [lat, lng] as P; });
  calls.push({ profile, waypoints, lonlats });
  if (profile === "loops-road" && engine.strictNoRoute(waypoints)) {
    return new Response("no track found", { status: 400 });
  }
  return new Response(buildGeojson(waypoints), { status: 200, headers: { "Content-Type": "application/json" } });
});
vi.stubGlobal("fetch", fakeFetch);

const { routeLoopCandidate, sceneryWaitBudgetMs } = await import("@/lib/route-generator");

const samePt = (a: P, b: P) => haversineKm(a, b) < 0.01;
/**
 * A far-point move keeps mid1 and mid2 and changes only the far point. (The
 * distance fit scales EVERY inner point, so it is not a far-point move.)
 */
const isFarPointMove = (c: EngineCall, wps: P[]) =>
  c.waypoints.length === wps.length &&
  samePt(c.waypoints[1], wps[1]) && samePt(c.waypoints[3], wps[3]) && !samePt(c.waypoints[2], wps[2]);
const strictCalls = () => calls.filter((c) => c.profile === "loops-road");
const relaxedCalls = () => calls.filter((c) => c.profile === "loops-road-relaxed");

beforeEach(() => {
  calls.length = 0;
  engine.strictNoRoute = () => false;
  engine.tags = () => "highway=tertiary surface=asphalt maxspeed=50";
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("routeLoopCandidate engine-call pattern", () => {
  it("routes a clean diamond with one strict call and a distance fit, nothing more", async () => {
    const wps = diamond(45);
    const path = await routeLoopCandidate(wps, "loops-road", 80, "road");
    expect(path).not.toBeNull();
    expect(path!.profile).toBe("loops-road");
    expect(relaxedCalls()).toHaveLength(0);
    // Straight-line diamond ≈ 61 km for an 80 km ask → one scaled re-route.
    expect(strictCalls().length).toBeLessThanOrEqual(2);
    expect(strictCalls()[0].lonlats).toBe(calls[0].lonlats);
  });

  it("never repeats a strict search that already came back 'no route' before falling back to the relaxed profile", async () => {
    engine.strictNoRoute = () => true;
    const wps = diamond(45);
    const path = await routeLoopCandidate(wps, "loops-road", 80, "road");
    expect(path).not.toBeNull();
    expect(path!.profile).toBe("loops-road-relaxed");

    const original = calls[0].lonlats;
    // The original waypoints get exactly ONE strict search…
    expect(strictCalls().filter((c) => c.lonlats === original)).toHaveLength(1);
    // …plus the five moved far points (each once), and no strict call after
    // the relaxed profile has been tried.
    expect(strictCalls()).toHaveLength(6);
    const firstRelaxedAt = calls.findIndex((c) => c.profile === "loops-road-relaxed");
    expect(firstRelaxedAt).toBeGreaterThan(0);
    expect(calls.slice(firstRelaxedAt).every((c) => c.profile === "loops-road-relaxed")).toBe(true);
    expect(relaxedCalls()[0].lonlats).toBe(original);
  });

  it("skips the far-point moves when the legs a move keeps already break the serving policy", async () => {
    // 3 km of primary road leaving the start: an exit stretch over 2.5 km is
    // rejected whatever the far point — every move keeps this leg.
    engine.tags = (leg, km) => (leg === 0 && km <= 3 ? "highway=primary surface=asphalt maxspeed=50" : "highway=tertiary surface=asphalt maxspeed=50");
    const wps = diamond(45);
    const path = await routeLoopCandidate(wps, "loops-road", 80, "road");
    expect(path).not.toBeNull();
    expect(relaxedCalls()).toHaveLength(0);
    // No ±25°/±45°/pulled-in attempts: just the one-shot route and its distance fit.
    expect(strictCalls().filter((c) => isFarPointMove(c, wps))).toHaveLength(0);
    expect(strictCalls().length).toBeLessThanOrEqual(2);
    // The route is returned as routed (phase 3 rejects it for the road standard).
    expect(path!.edgeTags?.some((t) => t?.highway === "primary")).toBe(true);
  });

  it("still tries the far-point moves when the compromise sits in a leg a move re-routes", async () => {
    // 2 km of primary on the way from mid1 to the far point: mid-ride, over
    // the 1.5 km single-stretch limit → the moves run (and here none helps).
    engine.tags = (leg, km) => (leg === 1 && km <= 2 ? "highway=primary surface=asphalt maxspeed=50" : "highway=tertiary surface=asphalt maxspeed=50");
    const wps = diamond(45);
    const path = await routeLoopCandidate(wps, "loops-road", 80, "road");
    expect(path).not.toBeNull();
    expect(strictCalls().filter((c) => isFarPointMove(c, wps))).toHaveLength(5);
    expect(relaxedCalls()).toHaveLength(0);
  });
});

describe("sceneryWaitBudgetMs", () => {
  it("waits at most 12 s past the end of routing, and never past the pipeline deadline", () => {
    expect(sceneryWaitBudgetMs(6_000)).toBe(12_000);
    expect(sceneryWaitBudgetMs(25_000)).toBe(12_000);
    expect(sceneryWaitBudgetMs(40_000)).toBe(4_000);
    expect(sceneryWaitBudgetMs(43_500)).toBe(1_500);
    expect(sceneryWaitBudgetMs(60_000)).toBe(1_500);
  });
});
