import { describe, it, expect } from "vitest";
import { nearbyPlaces, placeCount } from "@/lib/places";

describe("bundled places", () => {
  it("ships a substantial European place set", () => {
    expect(placeCount()).toBeGreaterThan(200_000);
  });

  it("finds villages and towns around Girona within 25 km, none in the open sea", () => {
    const girona = nearbyPlaces(41.9794, 2.8214, 25);
    expect(girona.length).toBeGreaterThan(100);
    expect(girona.every((p) => [0, 1, 2].includes(p.weight))).toBe(true);
    const sea = nearbyPlaces(42.8, 5.0, 20); // Gulf of Lion, ~70 km offshore
    expect(sea.length).toBe(0);
  });

  it("covers home turf: Skerries has dozens of places within 15 km", () => {
    const skerries = nearbyPlaces(53.5799, -6.1078, 15);
    expect(skerries.length).toBeGreaterThan(30);
  });

  it("respects the radius", () => {
    const near = nearbyPlaces(53.3498, -6.2603, 5).length;
    const far = nearbyPlaces(53.3498, -6.2603, 30).length;
    expect(far).toBeGreaterThan(near);
  });
});
