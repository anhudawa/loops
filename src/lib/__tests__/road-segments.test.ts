import { describe, it, expect } from "vitest";
import {
  parseBRouterMessages,
  remapEdgeTags,
  buildRoadReport,
  scoreEdges,
  validateRoadEdges,
  compromiseAcceptable,
  classifyEdge,
  describeCompromise,
  type EdgeTags,
} from "@/lib/road-segments";

// ── Synthetic track: a straight line north, ~20 m per point ─────────────────
type P = [number, number];
const KM_LAT = 0.009;
function line(n: number, from: P = [53.5, -6.1]): P[] {
  const out: P[] = [];
  for (let i = 0; i < n; i++) out.push([from[0] + (i * 0.02) * KM_LAT, from[1]]);
  return out;
}
const QUIET = { highway: "tertiary", surface: "asphalt", maxspeed: "50" };
const PRIMARY = { highway: "primary", surface: "asphalt", maxspeed: "60" };
const FAST = { highway: "secondary", surface: "asphalt", maxspeed: "100" };
const FAST_TRACK = { highway: "secondary", surface: "asphalt", maxspeed: "100", "cycleway:both": "track" };
const GRAVEL = { highway: "unclassified", surface: "gravel" };

/** Edge tags: `runs` = [tags, edgeCount][] */
function edges(runs: Array<[Record<string, string> | null, number]>): EdgeTags {
  const out: EdgeTags = [];
  for (const [t, n] of runs) for (let i = 0; i < n; i++) out.push(t);
  return out;
}

describe("parseBRouterMessages", () => {
  it("aligns message rows with the geometry and fills every edge of each run", () => {
    const coords = line(6);
    const micro = (p: P) => [String(Math.round(p[1] * 1e6)), String(Math.round(p[0] * 1e6))];
    const header = ["Longitude", "Latitude", "Elevation", "Distance", "CostPerKm", "ElevCost", "TurnCost", "NodeCost", "InitialCost", "WayTags", "NodeTags", "Time", "Energy"];
    const row = (p: P, tags: string) => [...micro(p), "10", "40", "1000", "0", "0", "0", "0", tags, "", "5", "100"];
    const messages = [
      header,
      row(coords[2], "highway=tertiary surface=asphalt maxspeed=50"),
      row(coords[5], "highway=primary surface=asphalt"),
    ];
    const tags = parseBRouterMessages(messages, coords)!;
    expect(tags).not.toBeNull();
    expect(tags.length).toBe(5);
    expect(tags[0]?.highway).toBe("tertiary");
    expect(tags[1]?.maxspeed).toBe("50");
    expect(tags[2]?.highway).toBe("primary");
    expect(tags[4]?.highway).toBe("primary");
  });

  it("returns null when there are no messages", () => {
    expect(parseBRouterMessages(undefined, line(3))).toBeNull();
    expect(parseBRouterMessages([], line(3))).toBeNull();
  });
});

describe("remapEdgeTags", () => {
  it("follows a spur splice: kept coords keep their edge tags, the bridge takes the road it left on", () => {
    const tags = edges([[QUIET, 3], [GRAVEL, 4], [PRIMARY, 3]]); // 10 edges, 11 coords
    const keep = [0, 1, 2, 3, 7, 8, 9, 10];                     // coords 4..6 spliced out
    const out = remapEdgeTags(tags, keep)!;
    expect(out.length).toBe(7);
    expect(out[2]).toBe(QUIET);
    expect(out[3]).toBe(GRAVEL);   // bridge edge 3→7
    expect(out[4]).toBe(PRIMARY);  // edge 7→8
  });
});

describe("classifyEdge (Road Standard)", () => {
  it("flags main roads, fast roads without a track, unpaved and unsuitable", () => {
    expect(classifyEdge(QUIET, "road")).toBeNull();
    expect(classifyEdge(PRIMARY, "road")).toBe("main_road");
    expect(classifyEdge({ highway: "trunk_link" }, "road")).toBe("main_road");
    expect(classifyEdge(FAST, "road")).toBe("fast_road");
    expect(classifyEdge(FAST_TRACK, "road")).toBeNull();         // segregated track → fine
    expect(classifyEdge({ ...FAST, "cycleway:both": "lane" }, "road")).toBe("fast_road"); // painted lane ≠ segregated
    expect(classifyEdge(GRAVEL, "road")).toBe("unpaved");
    expect(classifyEdge(GRAVEL, "gravel")).toBeNull();
    expect(classifyEdge({ highway: "tertiary", "class:bicycle": "-3" }, "road")).toBe("unsuitable");
    expect(classifyEdge({ highway: "tertiary", smoothness: "very_bad" }, "road")).toBe("unsuitable");
    expect(classifyEdge({ highway: "tertiary", maxspeed: "70 mph" }, "road")).toBe("fast_road");   // 112 km/h: fast on any class
    // Nominal rural limits on quiet lanes are NOT fast roads (Spain/France 90, Ireland 80)…
    expect(classifyEdge({ highway: "tertiary", maxspeed: "90", estimated_traffic_class: "2" }, "road")).toBeNull();
    expect(classifyEdge({ highway: "unclassified", maxspeed: "80" }, "road")).toBeNull();
    // …unless the engine estimates real traffic on them.
    expect(classifyEdge({ highway: "tertiary", maxspeed: "90", estimated_traffic_class: "5" }, "road")).toBe("fast_road");
    // Regional roads at 80/90: fast unless the engine says genuinely quiet; unknown traffic = fast.
    expect(classifyEdge({ highway: "secondary", maxspeed: "90", estimated_traffic_class: "2" }, "road")).toBeNull();
    expect(classifyEdge({ highway: "secondary", maxspeed: "90", estimated_traffic_class: "3" }, "road")).toBeNull();
    expect(classifyEdge({ highway: "secondary", maxspeed: "90", estimated_traffic_class: "4" }, "road")).toBe("fast_road");
    expect(classifyEdge({ highway: "secondary", maxspeed: "80" }, "road")).toBe("fast_road");
  });
});

describe("buildRoadReport", () => {
  it("reports a clean loop as meeting the standard with distance-weighted shares", () => {
    const coords = line(101);                     // 100 edges ≈ 2 km
    const tags = edges([[QUIET, 60], [{ highway: "residential", surface: "asphalt" }, 40]]);
    const r = buildRoadReport(coords, tags, "road");
    expect(r.standard_met).toBe(true);
    expect(r.compromises).toEqual([]);
    expect(r.road_class_pct.tertiary).toBe(60);
    expect(r.road_class_pct.residential).toBe(40);
    expect(r.surface.paved_pct).toBe(100);
    expect(r.known_pct).toBe(100);
    expect(r.summary).toMatch(/Meets the Loops road standard/);
  });

  it("measures a mid-route primary stretch and names its kind (trust rule)", () => {
    const coords = line(101);
    const tags = edges([[QUIET, 40], [PRIMARY, 30], [QUIET, 30]]); // 30 edges ≈ 600 m
    const r = buildRoadReport(coords, tags, "road");
    expect(r.standard_met).toBe(false);
    expect(r.compromises.length).toBe(1);
    const c = r.compromises[0];
    expect(c.kind).toBe("main_road");
    expect(c.meters).toBeGreaterThan(550);
    expect(c.meters).toBeLessThan(650);
    expect(c.start).toBe(40);
    expect(c.end).toBe(70);
    expect(r.main_road_pct).toBe(30);
    expect(describeCompromise(c)).toMatch(/^\d+ m on a primary road \(main road\)$/);
    expect(describeCompromise({ ...c, name: "R755" })).toBe(`${c.meters} m on the R755 (main road)`);
    expect(r.summary).toMatch(/^Compromise: /);
  });

  it("ignores a junction crossing (< 40 m) and merges stretches split by a short gap", () => {
    const coords = line(101);
    const tags = edges([[QUIET, 50], [PRIMARY, 1], [QUIET, 49]]); // 20 m of primary = crossing
    expect(buildRoadReport(coords, tags, "road").standard_met).toBe(true);
    const split = edges([[QUIET, 30], [FAST, 20], [QUIET, 2], [FAST, 20], [QUIET, 28]]); // 40 m gap
    const r = buildRoadReport(coords, split, "road");
    expect(r.compromises.length).toBe(1);
    expect(r.compromises[0].kind).toBe("fast_road");
    expect(r.compromises[0].meters).toBeGreaterThan(800);
  });

  it("counts untagged edges as unknown, not as compromises", () => {
    const coords = line(101);
    const tags = edges([[QUIET, 50], [null, 50]]);
    const r = buildRoadReport(coords, tags, "road");
    expect(r.known_pct).toBe(50);
    expect(r.surface.unknown_pct).toBe(50);
    expect(r.standard_met).toBe(true);
  });
});

describe("compromiseAcceptable", () => {
  const coords = line(2501); // 2500 edges ≈ 50 km
  it("serves a short unavoidable stretch, marked", () => {
    const tags = edges([[QUIET, 1000], [PRIMARY, 25], [QUIET, 1475]]); // 500 m
    const r = buildRoadReport(coords, tags, "road");
    expect(r.standard_met).toBe(false);
    expect(compromiseAcceptable(r, 50)).toBe(true);
  });
  it("refuses a long main-road stretch", () => {
    const tags = edges([[QUIET, 1000], [PRIMARY, 100], [QUIET, 1400]]); // 2 km
    expect(compromiseAcceptable(buildRoadReport(coords, tags, "road"), 50)).toBe(false);
  });
  it("refuses any motorway, however short", () => {
    const tags = edges([[QUIET, 1000], [{ highway: "motorway" }, 5], [QUIET, 1495]]);
    expect(compromiseAcceptable(buildRoadReport(coords, tags, "road"), 50)).toBe(false);
  });
  it("refuses more than 200 m of unpaved on a road ride, but tolerates a short gravel link", () => {
    const long = edges([[QUIET, 1000], [GRAVEL, 30], [QUIET, 1470]]); // 600 m of gravel
    expect(compromiseAcceptable(buildRoadReport(coords, long, "road"), 50)).toBe(false);
    const short = edges([[QUIET, 1000], [GRAVEL, 4], [QUIET, 1496]]);  // 80 m
    const r = buildRoadReport(coords, short, "road");
    expect(r.standard_met).toBe(false);
    expect(compromiseAcceptable(r, 50)).toBe(true);
  });
  it("refuses a ground path tagged bad smoothness (the engine's last-resort dead-end case)", () => {
    const bad = { highway: "path", surface: "ground", smoothness: "bad" };
    const tags = edges([[QUIET, 1000], [bad, 30], [QUIET, 1470]]);
    expect(compromiseAcceptable(buildRoadReport(coords, tags, "road"), 50)).toBe(false);
  });
  it("refuses when the compromises add up past 3% of the ride", () => {
    const runs: Array<[Record<string, string>, number]> = [];
    for (let i = 0; i < 5; i++) runs.push([QUIET, 400], [FAST, 30]); // 5 × 600 m = 3 km > 1.5 km
    runs.push([QUIET, 350]);
    expect(compromiseAcceptable(buildRoadReport(coords, edges(runs), "road"), 50)).toBe(false);
  });
});

describe("scoreEdges", () => {
  it("scores a quiet paved loop highly and a main-road loop low", () => {
    const coords = line(201);
    const good = scoreEdges(coords, edges([[QUIET, 200]]), "road");
    const bad = scoreEdges(coords, edges([[{ highway: "trunk", surface: "asphalt", maxspeed: "100" }, 200]]), "road");
    expect(good.surface_score).toBeGreaterThan(bad.surface_score);
    expect(good.safety_score).toBeGreaterThan(bad.safety_score);
    expect(good.traffic_volume_score).toBeGreaterThan(bad.traffic_volume_score);
    expect(good.bicycle_access_score).toBe(15);
    expect(good.confidence).toBe(1);
    expect(good.surface.paved_pct).toBe(100);
    expect(bad.flags.some((f) => /trunk/.test(f))).toBe(true);
  });

  it("penalises choppy road-type switching", () => {
    const coords = line(201);
    const runs: Array<[Record<string, string>, number]> = [];
    for (let i = 0; i < 100; i++) runs.push([QUIET, 1], [{ highway: "residential" }, 1]);
    const choppy = scoreEdges(coords, edges(runs), "road");
    expect(choppy.road_continuity_score).toBe(1);
  });
});

describe("validateRoadEdges", () => {
  const coords = line(201); // ≈ 4 km
  it("fails a road route with > 5% main road / > 10% fast road", () => {
    const main = validateRoadEdges(coords, edges([[QUIET, 180], [PRIMARY, 20]]), "road");
    expect(main.find((v) => v.rule === "ROAD_TYPE_BLACKLIST")?.severity).toBe("fatal");
    const fast = validateRoadEdges(coords, edges([[QUIET, 170], [FAST, 30]]), "road");
    expect(fast.find((v) => v.rule === "SPEED_LIMIT")?.severity).toBe("fatal");
  });
  it("fails a road route through a ford, warns for gravel", () => {
    const tags = edges([[QUIET, 199], [{ highway: "unclassified", ford: "yes" }, 1]]);
    expect(validateRoadEdges(coords, tags, "road").find((v) => v.rule === "WATER_CROSSING_CHECK")?.severity).toBe("fatal");
    expect(validateRoadEdges(coords, tags, "gravel").find((v) => v.rule === "WATER_CROSSING_CHECK")?.severity).toBe("warning");
  });
  it("fails a long tunnel without cycling access, passes one with", () => {
    const tunnel = { highway: "primary", tunnel: "yes" };
    const okTunnel = { highway: "cycleway", tunnel: "yes" };
    expect(validateRoadEdges(coords, edges([[QUIET, 180], [tunnel, 20]]), "road").some((v) => v.rule === "TUNNEL_CHECK")).toBe(true);
    expect(validateRoadEdges(coords, edges([[QUIET, 180], [okTunnel, 20]]), "road").some((v) => v.rule === "TUNNEL_CHECK")).toBe(false);
  });
  it("gravel: fails a mostly paved route", () => {
    const v = validateRoadEdges(coords, edges([[QUIET, 200]]), "gravel");
    expect(v.some((x) => x.rule === "SURFACE_MISMATCH" && x.severity === "fatal")).toBe(true);
  });
  it("passes a clean road loop with only the cycleway-share warning", () => {
    const v = validateRoadEdges(coords, edges([[QUIET, 200]]), "road");
    expect(v.filter((x) => x.severity === "fatal")).toEqual([]);
  });
});
