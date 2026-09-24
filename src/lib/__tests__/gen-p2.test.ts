import { describe, it, expect } from "vitest";
import { parseBasicIntent, parseBasicWorkout, parseRideWhen, stripSymbols, workoutSummary, defaultLengthNotice } from "../route-intent";
import { sessionLabel, pickByDistanceFit, effortHillName, lapsShareNote } from "../route-generator";
import { analyzeWind, departureFor } from "../wind";
import { lookupKnownPlace } from "../places-known";

describe("TRV-10: Pollença / pollensa and Sóller / Port de Sóller", () => {
  it("both spellings are the town; the ports are their own places", () => {
    expect(lookupKnownPlace("Pollença")!.name).toBe("Pollença");
    expect(lookupKnownPlace("pollensa")!.name).toBe("Pollença");
    expect(lookupKnownPlace("puerto pollensa")!.name).toBe("Port de Pollença");
    expect(lookupKnownPlace("Port de Soller")!.name).toBe("Port de Sóller");
    expect(lookupKnownPlace("soller")!.name).toBe("Sóller");
  });
});

describe("HV-10: Spanish and emoji prompts", () => {
  it("'vuelta de 3 horas desde Calpe' is 3 hours from Calpe", () => {
    const r = parseBasicIntent("vuelta de 3 horas desde Calpe")!;
    expect(r.duration_minutes).toBe(180);
    expect(r.region).toBe("Calpe");
  });
  it("'salida de hora y media partiendo de Dénia' is 90 minutes from Dénia", () => {
    const r = parseBasicIntent("salida de hora y media partiendo de Dénia")!;
    expect(r.duration_minutes).toBe(90);
    expect(r.region).toBe("Dénia");
  });
  it("emoji are dropped: '🚴‍♂️☀️ 2h from Ballsbridge 🙏'", () => {
    expect(stripSymbols("🚴‍♂️☀️ 2h from Ballsbridge 🙏")).toBe("2h from Ballsbridge");
    const r = parseBasicIntent("🚴‍♂️☀️ 2h from Ballsbridge 🙏")!;
    expect(r.duration_minutes).toBe(120);
    expect(r.region).toBe("Ballsbridge");
  });
});

describe("HV-11: a ride with no length from the phone's location", () => {
  it("defaults to 50 km with the location, declines without it", () => {
    expect(parseBasicIntent("ride a loop please")).toBeNull();
    const r = parseBasicIntent("ride a loop please", { origin: [28.922, -13.666] })!;
    expect(r.distance_km).toBe(50);
    expect(r.region).toBeNull();
    expect(r.distance_defaulted).toBe(true);
    expect(defaultLengthNotice("ride a loop please", 50, [28.922, -13.666])).toMatch(/No distance given/);
  });
  it("still declines chatter that asks for no ride", () => {
    expect(parseBasicIntent("hello there", { origin: [53.3, -6.2] })).toBeNull();
  });
});

describe("HV-12: café wording and when the rider rides", () => {
  it("'coffee halfway' is a café stop", () => {
    expect(parseBasicIntent("Malaga 3h coffee halfway")!.cafe_stop).toBe(true);
  });
  it("the long Lanzarote voice note keeps its start, café and terrain", () => {
    const r = parseBasicIntent("Hi, we're staying in Puerto del Carmen for the week, I'd like about three hours tomorrow, somewhere to stop for a coffee halfway, not bothered about climbing")!;
    expect(r.region).toBe("Puerto del Carmen");
    expect(r.duration_minutes).toBe(180);
    expect(r.cafe_stop).toBe(true);
    expect(r.elevation_preference).toBe("any");
  });
  it("reads tomorrow / this afternoon / clock times", () => {
    expect(parseRideWhen("from faro 60km tomorrow morning tailwind home")).toEqual({ day_offset: 1, hour: 9, label: "tomorrow morning" });
    expect(parseRideWhen("50km this afternoon from Bray")).toEqual({ day_offset: 0, hour: 14, label: "this afternoon" });
    expect(parseRideWhen("tomorrow at 7am, 2 hours from Calpe")).toEqual({ day_offset: 1, hour: 7, label: "tomorrow at 07:00" });
    expect(parseRideWhen("tomorrow, 3 hours")).toEqual({ day_offset: 1, hour: 9, label: "tomorrow" });
  });
  it("is not fooled by paces, powers or plain rides", () => {
    expect(parseRideWhen("60km from Faro")).toBeNull();
    expect(parseRideWhen("2x20 at 95% from Kinsale")).toBeNull();
    expect(parseRideWhen("4x4 at 400w from Clontarf")).toBeNull();
    expect(parseRideWhen("today 40km")).toBeNull();
    expect(parseRideWhen("vuelta por la mañana desde Calpe")).toBeNull();
  });
  it("departure is the local hour on that day, never in the past", () => {
    const now = new Date("2026-09-24T15:00:00Z");
    // Faro is UTC+1 in September: tomorrow 09:00 local = 08:00 UTC.
    expect(departureFor({ day_offset: 1, hour: 9, label: "tomorrow morning" }, 3600, now).toISOString()).toBe("2026-09-25T08:00:00.000Z");
    // "this morning" at 16:00 local is now.
    expect(departureFor({ day_offset: 0, hour: 9, label: "this morning" }, 3600, now).toISOString()).toBe(now.toISOString());
  });
  it("the light-wind note names the day the rider asked about", () => {
    const coords: [number, number][] = [[53, -6], [53.1, -6], [53, -6]];
    const note = analyzeWind(coords, { direction_deg: 270, speed_kmh: 3, forecast_time: "", when_label: "tomorrow morning" }, "tailwind_home").note;
    expect(note).toBe("Wind is light (3 km/h) — not worth planning around tomorrow morning.");
    expect(analyzeWind(coords, { direction_deg: 270, speed_kmh: 3, forecast_time: "" }, "tailwind_home").note).toMatch(/today\.$/);
  });
});

describe("CA-10: sweet spot is not tempo", () => {
  it("keeps the rider's zone word", () => {
    const w = parseBasicWorkout("3x10 sweet spot from Skerries")!.workout;
    expect(w.intervals[0].zone).toBe("z3");
    expect(workoutSummary(w)).toBe("3 × 10 min sweet spot");
    expect(sessionLabel(w)).toBe("3 × 10 min sweet spot");
  });
  it("tempo stays tempo, VO2 max is spelt the same everywhere", () => {
    expect(workoutSummary(parseBasicWorkout("4x8 tempo from Bray")!.workout)).toBe("4 × 8 min tempo");
    expect(workoutSummary(parseBasicWorkout("5x5 VO2 max from Calpe")!.workout)).toBe("5 × 5 min VO2 max");
  });
});

describe("CLT-12: distance fit", () => {
  const c = (km: number, met = true) => ({ distance_km: km, road_report: { standard_met: met } });
  it("drops a third option more than 20 % off (Malahide 49 / 61 / 37.5 for 50)", () => {
    const got = pickByDistanceFit([c(49.4), c(61), c(37.5)], 50);
    expect(got.map((x) => x.distance_km)).toEqual([49.4, 61]);
  });
  it("puts loops within ±10 % ahead of the rest", () => {
    const got = pickByDistanceFit([c(58), c(47), c(52)], 50);
    expect(got.map((x) => x.distance_km)).toEqual([47, 52, 58]);
  });
  it("offers a poor fit only as a second option", () => {
    expect(pickByDistanceFit([c(131), c(110)], 100).map((x) => x.distance_km)).toEqual([110, 131]);
    expect(pickByDistanceFit([c(131), c(99), c(104)], 100).map((x) => x.distance_km)).toEqual([99, 104]);
    expect(pickByDistanceFit([c(75)], 60).map((x) => x.distance_km)).toEqual([75]);
  });
  it("keeps the Road Standard first", () => {
    const got = pickByDistanceFit([c(55, true), c(50, false)], 50);
    expect(got.map((x) => x.distance_km)).toEqual([55, 50]);
  });
});

describe("CA-11: an effort is named after a hill only when it climbs it", () => {
  const roads = [{ name: "Carrickgollogan", point: [53.2152, -6.1622] as [number, number] }];
  const peaks = [{ name: "Carrickgollogan", point: [53.217, -6.1575] as [number, number] }];
  it("Monastery Road, Enniskerry is not Carrickgollogan", () => {
    expect(effortHillName([53.20168, -6.176181], roads, peaks)).toBeUndefined();
  });
  it("a climb topping out at the summit road is", () => {
    expect(effortHillName([53.2149, -6.1630], roads, peaks)).toBe("Carrickgollogan");
  });
});

describe("CA-13: laps say how much of the ride they are", () => {
  it("names the share and the turnarounds", () => {
    expect(lapsShareNote(11, 2.5, 42.6)).toBe("About 65 % of the ride is this one stretch, back and forth (10 turnarounds on the road — pick a safe spot to turn). ");
    expect(lapsShareNote(1, 2.5, 42.6)).toBe("");
  });
});

describe("TRV-11: hilly asks do not run far long", () => {
  const c = (km: number) => ({ distance_km: km, road_report: { standard_met: true } });
  it("'100 km hilly' drops the 131 km option, keeps a short poor fit", () => {
    expect(pickByDistanceFit([c(114), c(131)], 100, true).map((x) => x.distance_km)).toEqual([114]);
    expect(pickByDistanceFit([c(114), c(75)], 100, true).map((x) => x.distance_km)).toEqual([114, 75]);
  });
});

describe("pickByDistanceFit fallback", () => {
  it("the second option, when none fits closely, is the one nearest the ask", () => {
    const r = (km: number) => ({ distance_km: km, road_report: { standard_met: true } });
    const out = pickByDistanceFit([r(49.4), r(34.5), r(61)], 50);
    expect(out.map((x) => x.distance_km)).toEqual([49.4, 61]);
  });
});
