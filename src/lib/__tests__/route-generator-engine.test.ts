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
  /**
   * The points the "road network" actually routes through for a request:
   * lets a test add an out-and-back spur (far → tip → far) or a detour to
   * particular legs. Identity by default.
   */
  reroute: (wps: P[]): P[] => wps,
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
  return new Response(buildGeojson(engine.reroute(waypoints)), { status: 200, headers: { "Content-Type": "application/json" } });
});
vi.stubGlobal("fetch", fakeFetch);

const { routeLoopCandidate, sceneryWaitBudgetMs, loopFitCostKm, planSecondPass } = await import("@/lib/route-generator");
const { repairSpurs } = await import("@/lib/route-rules");

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
  engine.reroute = (wps) => wps;
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

// ── Retrace vs distance fit ──────────────────────────────────────────────────

/** Bearing (0–360) and distance of a waypoint from the start. */
function polar(p: P): { bearing: number; km: number } {
  const dLon = ((p[1] - START[1]) * Math.PI) / 180;
  const lat1 = (START[0] * Math.PI) / 180, lat2 = (p[0] * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return { bearing: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, km: haversineKm(START, p) };
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/**
 * A "road network" that leaves a via point along an out-and-back finger
 * (point → tip → point, radially outward) when `spurTipKm(point)` says so —
 * the only road on from that village — and reaches a via point through
 * `detour(point)` when given. A leg that ENDS at the point has no finger
 * (the engine stops there); a leg that continues from it does, whether it
 * is a one-shot loop or the return leg of a no-go-return attempt.
 */
function network(spurTipKm: (pt: P) => number, detour: (pt: P) => P | null = () => null) {
  return (wps: P[]): P[] => {
    const out: P[] = [];
    wps.forEach((w, i) => {
      const d = i > 0 ? detour(w) : null;
      if (d) out.push(d);
      out.push(w);
      const tip = i < wps.length - 1 ? spurTipKm(w) : 0;
      if (tip > 0) {
        const { bearing } = polar(w);
        out.push(destination(w, bearing, tip), w);
      }
    });
    return out;
  };
}

describe("loopFitCostKm", () => {
  it("counts a kilometre of retrace like a kilometre off the ask", () => {
    expect(loopFitCostKm(80, 0, 80)).toBe(0);
    expect(loopFitCostKm(88, 8, 80)).toBe(8);          // 80 km served after cutting 8 km
    expect(loopFitCostKm(68.2, 7.6, 80)).toBeCloseTo(27, 1);  // Faro: 60.6 km served, 7.6 km cut
    expect(loopFitCostKm(89.3, 11.2, 80)).toBeCloseTo(13.1, 1); // Faro: 78.1 km served, 11.2 km cut
    expect(loopFitCostKm(264.8, 160.6, 80)).toBeCloseTo(184.8, 1);
    expect(loopFitCostKm(121.5, 13.5, 80)).toBeCloseTo(41.5, 1);
  });
});

describe("routeLoopCandidate: retrace counts in the distance fit", () => {
  it("takes the scaled route with no retrace over one losing 20 km when the distance fit is comparable", async () => {
    const wps = diamond(45);
    const far = wps[2];
    // The one-shot loop at radius R carries a 10 km finger at the far point
    // (61 km served after cutting 20 km); the scaled loop (×1.31) has no
    // finger but the road into its far point detours far north: ~108 km
    // served, nothing cut.
    engine.reroute = network(
      (pt) => (samePt(pt, far) ? 10 : 0),
      (pt) => { const { bearing, km } = polar(pt); return near(bearing, 45, 1) && km > R_KM * 1.2 ? destination(START, 0, 38) : null; }
    );
    const path = await routeLoopCandidate(wps, "loops-road", 80, "road");
    expect(path).not.toBeNull();
    // 61 km served was 19 km off the ask, ~108 km served is ~28 km off —
    // comparable — and the scaled route cuts nothing: it wins (the old
    // closer-served-wins rule kept the finger).
    expect(path!.distance_km).toBeGreaterThan(100);
    expect(repairSpurs(path!.coords).removedKm).toBeLessThan(0.2);
    // Nothing left to shape: one-shot + distance fit only.
    expect(strictCalls()).toHaveLength(2);
    expect(relaxedCalls()).toHaveLength(0);
  });

  it("keeps the current route when the scaled one could never be served", async () => {
    const wps = diamond(45);
    // Scaled far point (×1.31): a 40 km finger — 80 km of a 160 km route
    // would be cut, twice the ask routed. The unscaled loop (61 km, nothing
    // cut) stays.
    engine.reroute = network((pt) => { const { bearing, km } = polar(pt); return near(bearing, 45, 1) && km > R_KM * 1.2 ? 40 : 0; });
    const path = await routeLoopCandidate(wps, "loops-road", 80, "road");
    expect(path).not.toBeNull();
    expect(path!.distance_km).toBeLessThan(65);
    expect(repairSpurs(path!.coords).removedKm).toBe(0);
  });
});

describe("routeLoopCandidate: loop shaping weighs distance fit against retrace", () => {
  it("prefers the loop on the ask that cuts 4 km over the loop 17 km short that cuts 1 km", async () => {
    const wps = diamond(45);
    // Every far point on the 45° bearing at full radius carries a 4 km
    // finger (8 km cut) → the loop needs shaping. Of the moved far points:
    // ±25° (bearings 70°/20°) carry a 2 km finger (4 km cut, ~79 km
    // served); pulled in 30 % carries a 0.5 km finger (1 km cut, ~62 km
    // served). Least-retrace-first took the short loop; fit cost 4.9 vs
    // 17.8 takes the loop on the ask.
    engine.reroute = network((pt) => {
      const { bearing, km } = polar(pt);
      if (near(bearing, 45, 1)) return km > R_KM * 0.95 ? 4 : 0.5;
      if (near(bearing, 70, 1) || near(bearing, 20, 1)) return 2;
      return 0;
    });
    const path = await routeLoopCandidate(wps, "loops-road", 80, "road");
    expect(path).not.toBeNull();
    const loss = repairSpurs(path!.coords).removedKm;
    expect(loss).toBeCloseTo(4, 0);
    const served = path!.distance_km - loss;
    expect(served).toBeGreaterThan(75);
    expect(served).toBeLessThan(85);
    // The loop's far point (the finger tip, before repair) sits on a ±25° bearing.
    const tip = path!.coords.reduce((a, b) => (haversineKm(START, b as P) > haversineKm(START, a as P) ? b : a)) as P;
    const { bearing } = polar(tip);
    expect(near(bearing, 70, 2) || near(bearing, 20, 2)).toBe(true);
  });
});

describe("planSecondPass", () => {
  const faro = [ // pass 1 at Faro: routed near the ask, served short after cutting 8–41 km
    { rawKm: 63.3, lossKm: 8.7, servedKm: 54.6 },
    { rawKm: 68.2, lossKm: 7.6, servedKm: 60.6 },
    { rawKm: 73.1, lossKm: 41.1, servedKm: 32 },
    { rawKm: 60.7, lossKm: 39.7, servedKm: 21 },
  ];
  const soller = [ // pass 1 at Sóller: the network detours, loops come out long
    { rawKm: 87.6, lossKm: 44.3, servedKm: 43.3 },
    { rawKm: 92.0, lossKm: 7.3, servedKm: 84.7 },
    { rawKm: 125.3, lossKm: 4.8, servedKm: 120.5 },
    { rawKm: 211, lossKm: 93.9, servedKm: 117 },
  ];
  const enniskerry = [ // loops genuinely short: the roads out there are short of the ask
    { rawKm: 42, lossKm: 1, servedKm: 41 },
    { rawKm: 45, lossKm: 2, servedKm: 43 },
    { rawKm: 40, lossKm: 0.5, servedKm: 39.5 },
  ];

  it("tries new directions, not a bigger radius, when the shortfall is retrace (Faro)", () => {
    const plan = planSecondPass(faro, 80, 0, 2);
    expect(plan.kind).toBe("new-directions");
    expect((plan as { why: string }).why).toMatch(/retrace/);
  });

  it("scales the radius down by the served ratio when loops come out long (Sóller)", () => {
    const plan = planSecondPass(soller, 80, 0, 0);
    expect(plan.kind).toBe("recalibrate");
    expect((plan as { radiusScale: number }).radiusScale).toBeCloseTo(80 / 117, 2);
  });

  it("scales the radius up by the ROUTED ratio when loops are genuinely short", () => {
    const plan = planSecondPass(enniskerry, 60, 0, 3);
    expect(plan.kind).toBe("recalibrate");
    expect((plan as { radiusScale: number }).radiusScale).toBeCloseTo(60 / 42, 2);
  });

  it("never over-corrects for retrace when scaling up: routed ×0.75, served ×0.5 → ×1.33, not ×1.5", () => {
    const plan = planSecondPass([
      { rawKm: 60, lossKm: 20, servedKm: 40 },
      { rawKm: 60, lossKm: 20, servedKm: 40 },
    ], 80, 0, 2);
    expect(plan.kind).toBe("recalibrate");
    expect((plan as { radiusScale: number }).radiusScale).toBeCloseTo(1 / 0.75, 2);
  });

  it("clamps the correction to ×0.5–×1.5", () => {
    const plan = planSecondPass([{ rawKm: 250, lossKm: 0, servedKm: 250 }, { rawKm: 240, lossKm: 0, servedKm: 240 }], 80, 0, 0);
    expect((plan as { radiusScale: number }).radiusScale).toBe(0.5);
  });

  it("does nothing when two loops were served near the ask", () => {
    expect(planSecondPass(faro, 80, 2, 3).kind).toBe("none");
  });

  it("tries new directions when sizing was fine but fewer than two loops survived", () => {
    const plan = planSecondPass([{ rawKm: 84, lossKm: 2, servedKm: 82 }, { rawKm: 78, lossKm: 1, servedKm: 77 }], 80, 1, 1);
    expect(plan.kind).toBe("new-directions");
    expect((plan as { why: string }).why).toMatch(/survived/);
  });

  it("needs two routed loops before it recalibrates", () => {
    expect(planSecondPass([{ rawKm: 40, lossKm: 0, servedKm: 40 }], 80, 0, 1).kind).toBe("new-directions");
    expect(planSecondPass([], 80, 0, 2).kind).toBe("none");
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
