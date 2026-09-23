import { describe, it, expect } from "vitest";
import { sampleVia, traceRoadReport, type TraceEngine } from "../road-trace";
import { haversine } from "../climb-detection";

// A 40 km square-ish loop, 10 m point spacing is overkill — use ~100 m.
function track(): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 100; i++) pts.push([53 + i * 0.0009, -6.2]);
  for (let i = 1; i <= 100; i++) pts.push([53.09, -6.2 + i * 0.0015]);
  for (let i = 1; i <= 100; i++) pts.push([53.09 - i * 0.0009, -6.05]);
  for (let i = 1; i <= 100; i++) pts.push([53, -6.05 - i * 0.0015]);
  return pts;
}
const lengthOf = (c: [number, number][]) => c.slice(1).reduce((s, p, i) => s + haversine(c[i], p), 0);

/** Fake engine: straight lines between via points, tagged as asked; optional stretch factor. */
const engine = (highway: string, stretch = 1, fail = false): TraceEngine => async (via) => {
  if (fail) return null;
  const coords: [number, number][] = [];
  for (let i = 0; i < via.length - 1; i++) {
    coords.push(via[i]);
    // a detour makes the trace longer than the track
    if (stretch > 1) coords.push([via[i][0] + 0.004 * (stretch - 1) * 10, via[i][1]]);
  }
  coords.push(via[via.length - 1]);
  return { coords, edgeTags: coords.slice(1).map(() => ({ highway, surface: "asphalt" })), distance_km: lengthOf(coords) };
};

describe("road-trace", () => {
  it("samples the start, one point per ~0.8 km, and the end", () => {
    const t = track();
    const via = sampleVia(t);
    expect(via[0]).toEqual(t[0]);
    expect(via[via.length - 1]).toEqual(t[t.length - 1]);
    const km = lengthOf(t);
    expect(via.length).toBeGreaterThan(km / 0.8 - 3);
    expect(via.length).toBeLessThan(km / 0.8 + 3);
  });
  it("reports a clean loop as meeting the standard", async () => {
    const r = await traceRoadReport(track(), "road", engine("tertiary"));
    expect(r?.standard_met).toBe(true);
    expect(r?.compromises).toEqual([]);
  });
  it("names main roads the track actually uses", async () => {
    const r = await traceRoadReport(track(), "road", engine("primary"));
    expect(r?.standard_met).toBe(false);
    expect(r?.main_road_pct).toBeGreaterThan(90);
  });
  it("returns unknown (null) when the trace is a different ride", async () => {
    expect(await traceRoadReport(track(), "road", engine("tertiary", 1.5))).toBeNull();
  });
  it("returns unknown when the engine fails or the budget is gone", async () => {
    expect(await traceRoadReport(track(), "road", engine("tertiary", 1, true))).toBeNull();
    expect(await traceRoadReport(track(), "road", engine("tertiary"), -1)).toBeNull();
  });
});
