import { describe, it, expect } from "vitest";
import { compactScenery, expandScenery, scoreRoute } from "@/lib/route-quality";
import type { EdgeTags } from "@/lib/road-segments";

type P = [number, number];
const KM_LAT = 0.009;
function line(n: number, from: P = [53.5, -6.1]): P[] {
  const out: P[] = [];
  for (let i = 0; i < n; i++) out.push([from[0] + i * 0.02 * KM_LAT, from[1]]);
  return out;
}

/** A coastline way running beside the route, a forest polygon, a café and a peak. */
function scenery() {
  const els: Array<Record<string, unknown>> = [];
  let id = 1;
  const coast: number[] = [];
  for (let i = 0; i < 120; i++) { els.push({ type: "node", id, lat: 53.5 + i * 0.0002, lon: -6.099 }); coast.push(id++); }
  els.push({ type: "way", id: id++, nodes: coast, tags: { natural: "coastline", source: "x" } });
  const wood: number[] = [];
  for (const [la, lo] of [[53.505, -6.102], [53.507, -6.102], [53.507, -6.098], [53.505, -6.098], [53.505, -6.102]]) { els.push({ type: "node", id, lat: la, lon: lo }); wood.push(id++); }
  els.push({ type: "way", id: id++, nodes: wood, tags: { natural: "wood", name: "Copse" } });
  els.push({ type: "node", id: id++, lat: 53.506, lon: -6.1, tags: { amenity: "cafe", name: "Beans" } });
  els.push({ type: "node", id: id++, lat: 53.51, lon: -6.105, tags: { natural: "peak", ele: "120" } });
  return els as never[];
}

describe("scenery cache compact form", () => {
  it("drops irrelevant tags, simplifies outlines, and expands back to scorable elements", () => {
    const raw = scenery();
    const c = compactScenery(raw);
    expect(c.ways.length).toBe(2);
    expect(c.nodes.length).toBe(2);
    expect(c.ways[0].t).toEqual({ natural: "coastline" });      // source= dropped
    expect(c.ways[0].c.length).toBeLessThan(80);                 // 22 m spacing → ~40 m simplification
    expect(c.ways[0].c.length).toBeGreaterThan(40);
    const back = expandScenery(c);
    expect(back.filter((e) => e.type === "way").length).toBe(2);
    expect(back.filter((e) => e.type === "node" && e.tags).length).toBe(2);
  });

  it("scores a route identically from the compact form and from the raw download", async () => {
    const coords = line(1001); // 20 km — past the road minimum-distance rule
    const tags: EdgeTags = new Array(1000).fill({ highway: "tertiary", surface: "asphalt", maxspeed: "50" });
    const raw = scenery();
    const a = await scoreRoute(coords, "road", { edgeTags: tags, scenic: raw });
    const b = await scoreRoute(coords, "road", { edgeTags: tags, scenic: expandScenery(compactScenery(raw)) });
    expect(b.breakdown.scenic_score).toBe(a.breakdown.scenic_score);
    expect(b.breakdown.scenic_diversity_score).toBe(a.breakdown.scenic_diversity_score);
    expect(b.breakdown.waypoint_interest_score).toBe(a.breakdown.waypoint_interest_score);
    expect(a.breakdown.scenic_score).toBeGreaterThan(0);
    expect(b.total).toBe(a.total);
  });
});
