/**
 * Riders' own phrasings (journey reports CLT/HV/TRV/CA, 2026-09-24) — each
 * one read by the basic parser (production has no model key), the way the
 * rider meant it.
 */
import { describe, it, expect, vi } from "vitest";
import {
  parseBasicIntent,
  parseBasicWorkout,
  parseDestination,
  resolveStartPoint,
  resolveDestination,
  normaliseLengths,
  namedPlace,
  workoutSummary,
  defaultLengthNotice,
  type Geocoder,
} from "@/lib/route-intent";
import { lookupKnownPlace, findKnownPlaceIn, displayPlaceName, nearestKnownPlace } from "@/lib/places-known";
import { nearbyPlaces } from "@/lib/places";

const never: Geocoder = async () => null;

describe("CLT-01: from X to X is a loop; 'X and back' starts at X", () => {
  it.each([
    ["3 hours from Clontarf to Clontarf", "Clontarf", 180],
    ["From Clontarf to Clontarf, 3 hours", "Clontarf", 180],
    ["Start my ride from Kinsale; 3 hour ride; finish in Kinsale", "Kinsale", 180],
    ["Clontarf and back, 3 hours", "Clontarf", 180],
  ])("%s", (prompt, region, minutes) => {
    const p = parseBasicIntent(prompt)!;
    expect(p.region).toBe(region);
    expect(p.destination).toBeNull();
    expect(p.duration_minutes).toBe(minutes);
    expect(p.country).toBe("Ireland");
  });

  it("parseDestination never returns the start as the destination", () => {
    expect(parseDestination("from Clontarf to Clontarf")).toBeNull();
    expect(parseDestination("Howth and back from Howth")).toBeNull();
  });
});

describe("CLT-02: the ', Co. X' qualifier stays with the place", () => {
  it("keeps 'Co. Wicklow' for the geocoder and resolves Laragh in Wicklow", async () => {
    const p = parseBasicIntent("loop from Laragh, Co. Wicklow, 70km")!;
    expect(p.region).toBe("Laragh, Co. Wicklow");
    expect(p.distance_km).toBe(70);
    const r = await resolveStartPoint(p.region!, p.country, undefined, never);
    expect(r.point[0]).toBeCloseTo(53.009, 2);
    expect(r.point[1]).toBeCloseTo(-6.298, 2);
  });

  it("knows the Wicklow villages and climbs", () => {
    for (const n of ["Laragh", "Glendalough", "Roundwood", "Sally Gap", "Wicklow Gap", "Killakee", "Glencree"]) {
      expect(lookupKnownPlace(n)?.country, n).toBe("Ireland");
    }
    expect(lookupKnownPlace("Sally Gap")!.point).toEqual([53.136, -6.313]);
  });

  it("a qualifier after a comma is not the place ('Kilmacanogue, Wicklow' is not Wicklow town)", () => {
    expect(lookupKnownPlace("Kilmacanogue, Wicklow")).toBeNull();
  });

  it("with an origin, the geocoder hit nearest the rider wins", async () => {
    const seen: Array<[number, number] | undefined> = [];
    const geocode: Geocoder = async (_q, _cc, _near, prefer) => {
      seen.push(prefer);
      return { point: [53.1, -6.3], country: "Ireland" };
    };
    await resolveStartPoint("Ballinastoe", "Ireland", [53.35, -6.26], geocode);
    expect(seen[0]).toEqual([53.35, -6.26]);
  });
});

describe("CLT-03/HV-01: 'here', 'my hotel' are not place names", () => {
  it.each(["here", "my location", "current location", "where I am", "home", "my house", "my place", "my hotel", "the hotel", "my apartment", "villa", "airbnb", "the Airbnb"])(
    "%s → no place",
    (s) => expect(namedPlace(s)).toBeNull(),
  );

  it("'from my hotel in playa del ingles 60km' starts in Playa del Inglés (Maspalomas)", async () => {
    const p = parseBasicIntent("from my hotel in playa del ingles 60km")!;
    expect(p.region?.toLowerCase()).toBe("playa del ingles");
    expect(p.distance_km).toBe(60);
    const r = await resolveStartPoint(p.region!, p.country, undefined, never);
    expect(r.point).toEqual(lookupKnownPlace("Maspalomas")!.point);
  });

  it("'2 hour ride from my hotel' uses the rider's location", async () => {
    const p = parseBasicIntent("2 hour ride from my hotel")!;
    expect(p.region).toBeNull();
    const r = await resolveStartPoint(p.region ?? undefined, p.country, [39.9, 3.08], never);
    expect(r.source).toBe("origin");
  });

  it("with no location it asks for one (turn on your location or name a town)", async () => {
    await expect(resolveStartPoint("my hotel", "Ireland", undefined, never)).rejects.toThrow(/turn on your location or name a town/);
  });

  it("refuses a geocoder hit ~2 000 km from the rider (Deia in Romania for a rider in Mallorca)", async () => {
    const romania: Geocoder = async () => ({ point: [45.9, 24.9], country: "Romania" });
    await expect(resolveStartPoint("Deiaa", "Spain", [39.57, 2.65], romania)).rejects.toThrow(/near you/);
  });

  it("accepts a far hit when the rider said which one ('Figueres, Spain')", async () => {
    const spain: Geocoder = async () => ({ point: [42.27, 2.96], country: "Spain" });
    const r = await resolveStartPoint("Figueres, Spain", "Ireland", [53.35, -6.26], spain);
    expect(r.country).toBe("Spain");
  });
});

describe("HV-02/TRV-06: a known place anywhere in the prompt is the start", () => {
  it("'malaga hills 70 km' plans from Málaga (even with a Dublin phone)", async () => {
    const p = parseBasicIntent("malaga hills 70 km")!;
    expect(p.region).toBe("Málaga");
    expect(p.country).toBe("Spain");
    expect(p.distance_km).toBe(70);
    const r = await resolveStartPoint(p.region!, p.country, [53.35, -6.26], never);
    expect(r.point).toEqual(lookupKnownPlace("Málaga")!.point);
  });

  it("'Girona 100km hilly' starts in Girona, Spain", () => {
    const p = parseBasicIntent("Girona 100km hilly")!;
    expect(p.region).toBe("Girona");
    expect(p.country).toBe("Spain");
    expect(p.distance_km).toBe(100);
    expect(p.elevation_preference).toBe("hilly");
  });

  it.each([
    ["60km loop in Calpe", "Calpe"],
    ["2 hours starting at Bray", "Bray"],
    ["hilly 80km near Enniskerry", "Enniskerry"],
    ["desde Málaga 60km", "Málaga"],
  ])("%s → %s", (prompt, region) => {
    expect(parseBasicIntent(prompt)!.region).toBe(region);
  });

  it("'in the Dublin mountains' is a range, not Dublin city centre", () => {
    expect(findKnownPlaceIn("a hilly 80km loop in the Dublin mountains")).toBeNull();
  });

  it("'a nice ride' is not Nice", () => {
    expect(findKnownPlaceIn("a nice ride of 60km")).toBeNull();
    expect(findKnownPlaceIn("60km from Nice")?.place.name).toBe("Nice");
  });
});

describe("CLT-05: named places to ride to", () => {
  it.each([
    ["Rocacorba from Girona and back", "Girona", "Rocacorba"],
    ["coffee in Banyoles and back from Girona", "Girona", "Banyoles"],
    ["from calpe up coll de rates and back", "calpe", "coll de rates"],
    ["Sally Gap loop from Rathfarnham 90km", "Rathfarnham", "Sally Gap"],
    ["over the Sally Gap from Bray", "Bray", "Sally Gap"],
    ["climb Teide from Puerto de la Cruz", "Puerto de la Cruz", "Teide"],
  ])("%s", (prompt, start, destination) => {
    expect(parseDestination(prompt)).toEqual({ start, destination });
    const p = parseBasicIntent(prompt)!;
    expect(p.destination).toBe(destination);
    expect(p.region).toBe(start);
  });

  it.each(["Hilly loop from Girona", "Easy spin from Bray 40km", "Sunday ride from Howth", "Loop from Skerries with a tailwind home"])(
    "no destination in %s",
    (prompt) => expect(parseDestination(prompt)).toBeNull(),
  );

  it("knows the iconic climbs", () => {
    for (const n of ["Rocacorba", "Els Àngels", "Coll de Rates", "Teide", "Sa Calobra", "Puig Major", "Pico de las Nieves", "Mirador del Río", "Fóia"]) {
      expect(lookupKnownPlace(n), n).not.toBeNull();
    }
  });

  it("a place it cannot find is declined by name, never dropped", async () => {
    await expect(resolveDestination("Rocacorbaz Peak", [41.9794, 2.8214], "Spain", never, "Girona"))
      .rejects.toThrow("We couldn't find Rocacorbaz Peak near Girona");
  });
});

describe("TRV-03/TRV-10: misspelt known places match before any geocoder", () => {
  it.each([
    ["soler", "Sóller"],
    ["deia", "Deià"],
    ["Deya", "Deià"],
    ["pollensa", "Pollença"],
    ["Port de Soller", "Port de Sóller"],
    ["port de pollensa", "Port de Pollença"],
    ["Enniskery", "Enniskerry"],
  ])("%s → %s", (typed, name) => {
    expect(lookupKnownPlace(typed)?.name).toBe(name);
  });

  it("does not stretch short names ('Alte' is not Altea, 'Galdar' is not Galway)", () => {
    expect(lookupKnownPlace("Alte")).toBeNull();
    expect(lookupKnownPlace("Galdar")).toBeNull();
  });

  it("shows a known place by its name, keeps an alias the rider typed", () => {
    expect(displayPlaceName("calpe")).toBe("Calpe");
    expect(displayPlaceName("soler")).toBe("Sóller");
    expect(displayPlaceName("coll de rates")).toBe("Coll de Rates");
    expect(displayPlaceName("Laragh, Co. Wicklow")).toBe("Laragh");
    expect(displayPlaceName("playa del ingles")).toBe("playa del ingles");
    expect(displayPlaceName("Figueres, Spain")).toBe("Figueres, Spain");
  });

  it("a phone in Mallorca is in Spain", () => {
    expect(nearestKnownPlace([39.9, 3.05], 150)?.country).toBe("Spain");
    expect(nearestKnownPlace([48.1, 11.6], 150)).toBeNull();
  });

  it("the town and the port are different starts", () => {
    expect(lookupKnownPlace("Pollença")!.point).not.toEqual(lookupKnownPlace("Port de Pollença")!.point);
    expect(lookupKnownPlace("Sóller")!.point).not.toEqual(lookupKnownPlace("Port de Sóller")!.point);
  });

  it("'2 hours from soler' starts in Sóller, Spain — no geocoder call", async () => {
    const p = parseBasicIntent("2 hours from soler")!;
    const geocode = vi.fn(never);
    const r = await resolveStartPoint(p.region!, p.country, undefined, geocode);
    expect(r.country).toBe("Spain");
    expect(r.point).toEqual(lookupKnownPlace("Sóller")!.point);
    expect(geocode).not.toHaveBeenCalled();
  });
});

describe("HV-05: the Canaries are on the map", () => {
  it("bundled places exist around Maspalomas, Puerto de la Cruz and Puerto del Carmen", () => {
    expect(nearbyPlaces(27.7606, -15.586, 20).length).toBeGreaterThan(10);
    expect(nearbyPlaces(28.4142, -16.5448, 20).length).toBeGreaterThan(10);
    expect(nearbyPlaces(28.9214, -13.663, 20).length).toBeGreaterThan(5);
  });

  it("knows the island anchors", () => {
    for (const n of ["Tejeda", "Ayacata", "Soria (Gran Canaria)", "Fataga", "San Bartolomé de Tirajana", "Vega de San Mateo", "Vilaflor", "La Orotava", "Masca", "Teguise", "Haría", "Yaiza", "Tinajo"]) {
      const k = lookupKnownPlace(n);
      expect(k?.point[0], n).toBeLessThan(29.5);
      expect(k?.point[0], n).toBeGreaterThan(27.5);
    }
  });
});

describe("HV-03: negations and terrain words", () => {
  it.each([
    ["60km nothing too hilly", "rolling"],
    ["60km not too hilly", "rolling"],
    ["60km no hills", "flat"],
    ["60km avoid hills", "flat"],
    ["60km without climbs", "flat"],
    ["60km flattish", "flat"],
    ["60km, not bothered about climbing", "any"],
    ["60km with some hills", "hilly"],
  ])("%s → %s", (prompt, pref) => {
    expect(parseBasicIntent(prompt)!.elevation_preference).toBe(pref);
  });

  it("trims the place at terrain and filler words", () => {
    expect(parseBasicIntent("60km from lagos nothing too hilly")!.region).toBe("lagos");
    expect(parseBasicIntent("2 hours from Calpe for a coffee")!.region).toBe("Calpe");
  });
});

describe("HV-04: lengths the way riders say them", () => {
  it.each([
    ["80k from Bray", 80],
    ["50 k from Bray", 50],
    ["70kms from Bray", 70],
    ["sixty km from Bray", 60],
    ["seventy five kilometres from Bray", 75],
    ["one hundred and twenty km from Bray", 120],
    ["Clontarf 60", 60],
  ])("%s → %i km", (prompt, km) => {
    expect(parseBasicIntent(prompt)!.distance_km).toBe(km);
  });

  it.each([
    ["an hour and a half from Bray", 90],
    ["2 and a half hours from Bray", 150],
    ["two and a half hours from Bray", 150],
    ["half day from Bray", 240],
    ["a couple of hours from Bray", 120],
    ["an hour from Bray", 60],
    ["2h30 from Bray", 150],
    ["A 2-hour road loop from Wicklow", 120],
    ["a 90-minute spin from Howth", 90],
  ])("%s → %i min", (prompt, minutes) => {
    expect(parseBasicIntent(prompt)!.duration_minutes).toBe(minutes);
  });

  it("number words only before a unit ('Two Rock' stays a mountain)", () => {
    expect(normaliseLengths("over Two Rock")).toBe("over two rock");
  });

  it("says when the length was defaulted", () => {
    expect(parseBasicIntent("loop from Skerries")!.distance_defaulted).toBe(true);
    expect(defaultLengthNotice("loop from Skerries", 50)).toBe("No distance given — planned 50 km");
    expect(defaultLengthNotice("60km loop from Skerries", 60)).toBeNull();
    expect(defaultLengthNotice("Pollença to Cap de Formentor and back", 50)).toBeNull();
  });
});

describe("CA-03/CA-07: sessions without a zone word, and zone before duration", () => {
  it("'hill repeats 6x3 min from Bray' is 6 × 3 min VO2", () => {
    const p = parseBasicIntent("hill repeats 6x3 min from Bray")!;
    expect(p.workout?.intervals[0]).toMatchObject({ count: 6, duration_minutes: 3, zone: "z5" });
    expect(p.region).toBe("Bray");
  });

  it.each([
    ["3 x 10 over-unders", "z4"],
    ["5x3 from Bray", "z5"],
    ["3x12 from Bray", "z4"],
  ])("%s → %s", (prompt, zone) => {
    expect(parseBasicWorkout(prompt)?.workout.intervals[0].zone).toBe(zone);
  });

  it("'tempo 40 min in a 3 hour ride from Galway' is a 3-hour ride with 40 min tempo", () => {
    const p = parseBasicIntent("tempo 40 min in a 3 hour ride from Galway")!;
    expect(p.workout?.intervals[0]).toMatchObject({ count: 1, duration_minutes: 40, zone: "z3" });
    expect(p.duration_minutes).toBe(180);
    expect(p.region).toBe("Galway");
  });

  it("'hill repeats' with no numbers asks for the efforts (declined, never a plain ride)", () => {
    expect(parseBasicIntent("hill repeats from Bray")).toBeNull();
  });

  it("'2x2 hours' is not a session", () => {
    expect(parseBasicWorkout("2x2 hours from Bray")).toBeNull();
  });
});

describe("CA-04: sprints keep their seconds", () => {
  it("'10 x 30s sprints' reads back as 10 × 30 s sprint", () => {
    const s = parseBasicWorkout("10 x 30s sprints from Skerries")!;
    expect(s.workout.intervals[0]).toMatchObject({ count: 10, duration_minutes: 1, duration_seconds: 30, zone: "z7" });
    expect(workoutSummary(s.workout)).toBe("10 × 30 s sprint");
  });

  it("whole minutes read as minutes", () => {
    expect(workoutSummary(parseBasicWorkout("2x20 min threshold")!.workout)).toBe("2 × 20 min threshold");
  });
});
