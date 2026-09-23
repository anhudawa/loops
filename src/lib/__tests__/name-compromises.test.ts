import { describe, it, expect } from "vitest";
import { nameCompromises, type Compromise } from "../road-segments";

const comp = (at: [number, number], highway = "primary"): Compromise => ({ kind: "main_road", start: 0, end: 1, meters: 900, highway, at });

describe("nameCompromises (batched)", () => {
  it("names each stretch from the way that passes it, in one request", async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ elements: [
        { tags: { ref: "Ma-2200" }, geometry: [{ lat: 39.90000, lon: 3.00000 }, { lat: 39.90100, lon: 3.00000 }] },
        { tags: { ref: "Ma-11" },   geometry: [{ lat: 39.80000, lon: 2.70000 }, { lat: 39.80100, lon: 2.70000 }] },
      ] }), { status: 200 });
    }) as unknown as typeof fetch;
    const a = comp([39.90050, 3.00001]);
    const b = comp([39.80050, 2.70001]);
    const far = comp([39.50000, 2.50000]);
    await nameCompromises([], [a, b, far], fakeFetch, { max: 3 });
    expect(calls).toBe(1);
    expect(a.name).toBe("Ma-2200");
    expect(b.name).toBe("Ma-11");
    expect(far.name).toBeUndefined();
  });
  it("never throws on a failed lookup", async () => {
    const boom = (async () => { throw new Error("503"); }) as unknown as typeof fetch;
    const c = comp([39.70000, 2.90000]);
    await expect(nameCompromises([], [c], boom)).resolves.toBeUndefined();
    expect(c.name).toBeUndefined();
  });
});
