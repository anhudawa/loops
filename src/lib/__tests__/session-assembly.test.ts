import { describe, it, expect } from "vitest";
import { stitchCorridors } from "../session-assembly";

/**
 * Synthetic road network helpers. Nodes are laid out on a lat/lng grid
 * where 0.01° lat ≈ 1.11 km.
 */
type Node = { id: number; lat: number; lon: number; tags?: Record<string, string> };
type Way = { id: number; nodes: number[]; tags: Record<string, string> };

function grid(nodes: Node[]): Map<number, Node> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/** A straight north-south line of nodes spaced ~1.1 km apart. */
function straightNodes(startId: number, count: number, lon = -6.3): Node[] {
  return Array.from({ length: count }, (_, i) => ({
    id: startId + i,
    lat: 53.0 + i * 0.01,
    lon,
  }));
}

describe("stitchCorridors", () => {
  it("stitches consecutive same-direction ways into one corridor", () => {
    // Three tertiary ways forming a straight ~6.6 km line
    const nodes = grid(straightNodes(1, 7));
    const ways: Way[] = [
      { id: 101, nodes: [1, 2, 3], tags: { highway: "tertiary" } },
      { id: 102, nodes: [3, 4, 5], tags: { highway: "tertiary" } },
      { id: 103, nodes: [5, 6, 7], tags: { highway: "tertiary" } },
    ];
    const corridors = stitchCorridors(nodes, ways, new Set(), 5);
    expect(corridors.length).toBeGreaterThanOrEqual(1);
    const longest = corridors.reduce((a, b) =>
      a.nodeIds.length >= b.nodeIds.length ? a : b
    );
    expect(longest.nodeIds).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("does not continue around a right-angle turn", () => {
    // North-south way (~3.3 km), then a short way heading due east from
    // its end (~1.3 km). Combined they pass 4 km — but only via a 90°
    // turn, which must not be stitched.
    const ns = straightNodes(1, 4); // ids 1-4 going north
    const east: Node[] = [
      { id: 10, lat: 53.03, lon: -6.28 },
      { id: 11, lat: 53.03, lon: -6.26 },
    ];
    const nodes = grid([...ns, ...east]);
    const ways: Way[] = [
      { id: 101, nodes: [1, 2, 3, 4], tags: { highway: "tertiary" } },
      { id: 102, nodes: [4, 10, 11], tags: { highway: "tertiary" } },
    ];
    const corridors = stitchCorridors(nodes, ways, new Set(), 4);
    expect(corridors.length).toBe(0);
  });

  it("never extends through a traffic signal", () => {
    const nodes = grid(straightNodes(1, 7));
    const ways: Way[] = [
      { id: 101, nodes: [1, 2, 3], tags: { highway: "tertiary" } },
      { id: 102, nodes: [3, 4, 5], tags: { highway: "tertiary" } },
      { id: 103, nodes: [5, 6, 7], tags: { highway: "tertiary" } },
    ];
    // Signal at node 3 blocks the join between way 101 and 102 …
    const corridors = stitchCorridors(nodes, ways, new Set([3]), 4);
    // … so no chain reaches 4 km except 102+103 (nodes 3..7, ~4.4 km),
    // which is allowed because the signal sits at its END, not interior.
    for (const c of corridors) {
      const interior = c.nodeIds.slice(1, -1);
      expect(interior).not.toContain(3);
    }
  });

  it("ignores non-corridor road classes", () => {
    const nodes = grid(straightNodes(1, 7));
    const ways: Way[] = [
      { id: 101, nodes: [1, 2, 3, 4, 5, 6, 7], tags: { highway: "primary" } },
    ];
    expect(stitchCorridors(nodes, ways, new Set(), 4)).toEqual([]);
  });
});
