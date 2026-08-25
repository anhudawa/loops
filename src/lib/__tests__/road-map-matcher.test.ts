import polyline from "@mapbox/polyline";
import { describe, expect, it, vi } from "vitest";
import {
  ValhallaMapMatcher,
  downsampleTrace,
} from "../road-intelligence/map-matcher";

describe("Clontarf road map matching boundary", () => {
  it("preserves endpoints when a long completed ride is downsampled", () => {
    const input = Array.from({ length: 11 }, (_, index) => [53.36 + index / 1_000, -6.2] as [number, number]);
    const output = downsampleTrace(input, 4);
    expect(output).toHaveLength(4);
    expect(output[0]).toBe(input[0]);
    expect(output.at(-1)).toBe(input.at(-1));
  });

  it("rejects insecure non-local provider URLs", () => {
    expect(() => new ValhallaMapMatcher({ baseUrl: "http://routing.example.com" })).toThrow(/HTTPS/);
  });

  it("maps a completed trace to stable directed OSM edges", async () => {
    const encodedShape = polyline.encode([
      [53.3608, -6.1968],
      [53.3618, -6.1900],
      [53.3630, -6.1830],
    ], 6);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      osm_changeset: 123456,
      shape: encodedShape,
      matched_points: [
        { type: "matched", edge_index: 0, distance_from_trace_point: 3 },
        { type: "matched", edge_index: 1, distance_from_trace_point: 8 },
      ],
      edges: [
        {
          id: "884400001122",
          way_id: 9001,
          begin_osm_node_id: 101,
          end_osm_node_id: 102,
          forward: true,
          names: ["Example Road"],
          length: 0.48,
          road_class: "tertiary",
          use: "road",
          surface: "paved_smooth",
          cycle_lane: "dedicated",
          begin_shape_index: 0,
          end_shape_index: 1,
        },
        {
          id: "884400001123",
          way_id: 9002,
          begin_osm_node_id: 102,
          end_osm_node_id: 103,
          forward: false,
          length: 0.62,
          begin_shape_index: 1,
          end_shape_index: 2,
        },
      ],
    }), { status: 200 }));
    const matcher = new ValhallaMapMatcher({
      baseUrl: "https://routing.example.com",
      fetchImpl,
    });

    const result = await matcher.match([
      [53.3608, -6.1968],
      [53.3630, -6.1830],
    ]);

    expect(result).toMatchObject({ provider: "valhalla", graphVersion: "123456", inputPointCount: 2 });
    expect(result.edges).toHaveLength(2);
    expect(result.edges[0]).toMatchObject({
      edgeKey: "osm:9001:101:102",
      traversalDirection: "forward",
      roadClass: "tertiary",
      lengthM: 480,
      matchConfidence: 0.94,
    });
    expect(result.edges[1]).toMatchObject({
      edgeKey: "osm:9002:103:102",
      traversalDirection: "reverse",
      lengthM: 620,
      matchConfidence: 0.84,
    });
    expect(result.edges[0].geometry).toHaveLength(2);

    const request = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(request).toMatchObject({ costing: "bicycle", shape_match: "map_snap" });
    expect(request.filters.attributes).toContain("edge.way_id");
    expect(request.filters.attributes).toContain("edge.begin_osm_node_id");
  });

  it("fails closed when the provider returns no road edges", async () => {
    const matcher = new ValhallaMapMatcher({
      baseUrl: "https://routing.example.com",
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ shape: "abc", edges: [] }), { status: 200 })),
    });
    await expect(matcher.match([[53.36, -6.2], [53.37, -6.19]])).rejects.toThrow(/no matched road edges/);
  });
});
