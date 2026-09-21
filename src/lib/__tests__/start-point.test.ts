import { describe, it, expect, vi } from "vitest";
import { resolveStartPoint, type Geocoder } from "@/lib/route-intent";
import { lookupKnownPlace } from "@/lib/places-known";

describe("lookupKnownPlace", () => {
  it("resolves launch destinations and aliases regardless of case/accents", () => {
    expect(lookupKnownPlace("Girona")?.country).toBe("Spain");
    expect(lookupKnownPlace("gerona")?.name).toBe("Girona");
    expect(lookupKnownPlace("Port de Pollensa")?.name).toBe("Port de Pollença");
    expect(lookupKnownPlace("Calp")?.name).toBe("Calpe");
    expect(lookupKnownPlace("Málaga")?.name).toBe("Málaga");
    expect(lookupKnownPlace("malaga")?.name).toBe("Málaga");
    expect(lookupKnownPlace("Dun Laoghaire")?.country).toBe("Ireland");
  });
  it("takes the most specific comma part: 'Port de Pollença, Mallorca' is the port, not Palma", () => {
    expect(lookupKnownPlace("Port de Pollença, Mallorca")?.name).toBe("Port de Pollença");
    expect(lookupKnownPlace("Calpe, Spain")?.name).toBe("Calpe");
    expect(lookupKnownPlace("Mallorca")?.name).toBe("Palma");
  });
  it("returns null for unknown places", () => {
    expect(lookupKnownPlace("Ballygobackwards")).toBeNull();
    expect(lookupKnownPlace("")).toBeNull();
  });
});

describe("resolveStartPoint (trust rule: a named place must resolve or we decline)", () => {
  const never: Geocoder = vi.fn(async () => null);

  it("resolves a known place locally without calling the geocoder, and fixes the country", async () => {
    const geocode = vi.fn(async () => null) as unknown as Geocoder;
    const r = await resolveStartPoint("Girona", "Ireland", [53.3, -6.2], geocode);
    expect(r.source).toBe("known_place");
    expect(r.country).toBe("Spain");
    expect(r.point[0]).toBeCloseTo(41.98, 1);
    expect(geocode).not.toHaveBeenCalled();
  });

  it("tries the parsed country first, then the whole world", async () => {
    const calls: Array<string | undefined> = [];
    const geocode: Geocoder = async (place, cc) => {
      calls.push(cc);
      if (cc === "ie") return null;                       // not in Ireland
      return { point: [42.26, 2.96], country: "Spain" };   // Figueres
    };
    const r = await resolveStartPoint("Figueres", "Ireland", undefined, geocode);
    expect(calls).toEqual(["ie", undefined]);
    expect(r.source).toBe("geocoded");
    expect(r.country).toBe("Spain");
  });

  it("NEVER swaps a named place for the rider's location or a country centre", async () => {
    await expect(resolveStartPoint("Ballygobackwards", "Ireland", [53.3, -6.2], never))
      .rejects.toThrow(/Couldn't find the location "Ballygobackwards"/);
  });

  it("uses the rider's location only when no place was named", async () => {
    const r = await resolveStartPoint(undefined, "Ireland", [53.3625, -6.17], never);
    expect(r.source).toBe("origin");
    expect(r.point).toEqual([53.3625, -6.17]);
  });

  it("declines honestly when there is neither a place nor a location", async () => {
    await expect(resolveStartPoint(undefined, "Ireland", undefined, never))
      .rejects.toThrow(/where to start/);
  });
});
