import { describe, expect, it } from "vitest";
import { parseDestination, parseBasicIntent, resolveDestination } from "@/lib/route-intent";
import { deliveryNote } from "@/lib/delivery-note";

describe("parseDestination", () => {
  it.each([
    ["Pollença to Cap de Formentor and back", "Pollença", "Cap de Formentor"],
    ["Ride from Pollença to Cap de Formentor lighthouse", "Pollença", "Cap de Formentor lighthouse"],
    ["I'm in Pollença and I want a route to Cap de Formentor and back", "Pollença", "Cap de Formentor"],
    ["ride out to Glendalough and back from Bray", "Bray", "Glendalough"],
    ["3 hour ride to Sa Calobra from Port de Pollença", "Port de Pollença", "Sa Calobra"],
    ["from Bray to Glendalough, 80km", "Bray", "Glendalough"],
    ["out and back to Cap de Formentor", null, "Cap de Formentor"],
  ])("%s", (prompt, start, destination) => {
    expect(parseDestination(prompt)).toEqual({ start, destination });
  });

  it.each([
    "Start my ride from Kinsale; 3 hour ride; finish in Kinsale",
    "2 hour ride close to home",
    "60 km loop from Dublin to include Howth",
    "I want to ride 50km from Girona",
    "loop from Skerries with a tailwind home",
  ])("no destination in %s", (prompt) => {
    expect(parseDestination(prompt)).toBeNull();
  });

  it("basic parser: a destination needs no distance, and the start is the named town", () => {
    const p = parseBasicIntent("Pollença to Cap de Formentor and back")!;
    expect(p.region).toBe("Pollença");
    expect(p.destination).toBe("Cap de Formentor");
    expect(p.distance_km).toBeNull();
  });
});

describe("resolveDestination", () => {
  const pollenca: [number, number] = [39.9077, 3.0813];
  const dublin: [number, number] = [53.3498, -6.2603];
  const noGeocode = async () => null;

  it("resolves an iconic cape locally, lighthouse suffix and all", async () => {
    const p = await resolveDestination("Cap de Formentor lighthouse", pollenca, "Spain", noGeocode);
    expect(p[0]).toBeCloseTo(39.96, 1);
  });

  it("declines a known place too far for a day out and back", async () => {
    await expect(resolveDestination("Cork", dublin, "Ireland", noGeocode)).rejects.toThrow(/too far/);
  });

  it("declines a place it cannot find near the start (never elsewhere)", async () => {
    await expect(resolveDestination("Narnia", dublin, "Ireland", noGeocode)).rejects.toThrow(/couldn.t find Narnia near/i);
  });

  it("uses the geocoder bounded around the start", async () => {
    let seenNear: [number, number] | undefined;
    const p = await resolveDestination("Some Col", pollenca, "Spain", async (_q, _cc, near) => {
      seenNear = near;
      return { point: [39.8, 2.9] };
    });
    expect(seenNear).toEqual(pollenca);
    expect(p).toEqual([39.8, 2.9]);
  });
});

describe("deliveryNote for a destination ride", () => {
  it("says the place sets the length", () => {
    expect(deliveryNote({ distance_km: 75, elevation_preference: "any", destination: "Cap de Formentor" }, { distance_km: 39.7, elevation_gain_m: 900 }))
      .toBe("Cap de Formentor and back is 40 km — shorter than the 75 km you asked for.");
  });
});

describe("deliveryNote without an asked distance", () => {
  it("says nothing about length", () => {
    expect(deliveryNote({ distance_km: 40, elevation_preference: "any", destination: "Glendalough", distance_asked: false }, { distance_km: 72, elevation_gain_m: 1200 })).toBeNull();
  });
});
