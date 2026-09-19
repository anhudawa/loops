import { describe, it, expect } from "vitest";
import { deliveryNote } from "@/lib/delivery-note";

describe("deliveryNote", () => {
  it("returns null when there's no request", () => {
    expect(deliveryNote(null, { distance_km: 50, elevation_gain_m: 200 })).toBeNull();
    expect(deliveryNote(undefined, { distance_km: 50, elevation_gain_m: 200 })).toBeNull();
  });

  it("stays quiet when distance is within tolerance and terrain matches", () => {
    // 60 km flat asked, 56 km / 250 m served — within 12% and under the flat ceiling.
    expect(
      deliveryNote({ distance_km: 60, elevation_preference: "flat" }, { distance_km: 56, elevation_gain_m: 250 })
    ).toBeNull();
  });

  it("flags a route that's meaningfully shorter", () => {
    const n = deliveryNote({ distance_km: 100, elevation_preference: "any" }, { distance_km: 80, elevation_gain_m: 500 });
    expect(n).toContain("20 km shorter");
  });

  it("flags a route that's meaningfully longer", () => {
    const n = deliveryNote({ distance_km: 40, elevation_preference: "any" }, { distance_km: 50, elevation_gain_m: 300 });
    expect(n).toContain("10 km longer");
  });

  it("flags hillier-than-flat (the 60 km flat -> 472 m case)", () => {
    const n = deliveryNote({ distance_km: 60, elevation_preference: "flat" }, { distance_km: 54.3, elevation_gain_m: 472 });
    expect(n).toContain("Hillier than");
    expect(n).toContain("472 m");
  });

  it("does not flag hills when the flat ceiling is respected", () => {
    // 60 km flat: ceiling 300 m, 1.15x = 345 m; 320 m is under.
    expect(
      deliveryNote({ distance_km: 60, elevation_preference: "flat" }, { distance_km: 60, elevation_gain_m: 320 })
    ).toBeNull();
  });

  it("does not police terrain for hilly/mountainous/any requests", () => {
    expect(
      deliveryNote({ distance_km: 60, elevation_preference: "hilly" }, { distance_km: 60, elevation_gain_m: 1500 })
    ).toBeNull();
    expect(
      deliveryNote({ distance_km: 60, elevation_preference: "any" }, { distance_km: 60, elevation_gain_m: 1500 })
    ).toBeNull();
  });

  it("can report both distance and terrain in one note", () => {
    const n = deliveryNote({ distance_km: 60, elevation_preference: "flat" }, { distance_km: 40, elevation_gain_m: 500 });
    expect(n).toContain("shorter");
    expect(n).toContain("Hillier");
  });
});
