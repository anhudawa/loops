import { describe, it, expect } from "vitest";
import { parseBasicIntent, sanitizeWorkout } from "../route-intent";

describe("parseBasicIntent — duration parsing", () => {
  it('parses "2 hour" as 120 minutes', () => {
    const r = parseBasicIntent("2 hour ride");
    expect(r).not.toBeNull();
    expect(r!.duration_minutes).toBe(120);
    expect(r!.distance_km).toBeNull();
  });

  it('parses "1.5 hours" as 90 minutes', () => {
    expect(parseBasicIntent("1.5 hours easy spin")!.duration_minutes).toBe(90);
  });

  it('parses "90 min" as 90 minutes', () => {
    expect(parseBasicIntent("90 min loop")!.duration_minutes).toBe(90);
  });

  it('parses "45 minutes" as 45 minutes', () => {
    expect(parseBasicIntent("45 minutes around the block")!.duration_minutes).toBe(45);
  });

  it('parses the bare "h" abbreviation ("2h")', () => {
    expect(parseBasicIntent("2h spin")!.duration_minutes).toBe(120);
  });

  it('combines hours and minutes ("1 hour 30 min" = 90)', () => {
    expect(parseBasicIntent("1 hour 30 min ride")!.duration_minutes).toBe(90);
  });
});

describe("parseBasicIntent — distance parsing", () => {
  it('parses "60km" as 60', () => {
    const r = parseBasicIntent("60km loop");
    expect(r!.distance_km).toBe(60);
    expect(r!.duration_minutes).toBeNull();
  });

  it('parses "60 kilometres" with a space and long unit', () => {
    expect(parseBasicIntent("a 60 kilometres ride")!.distance_km).toBe(60);
  });

  it('converts "40 miles" to ~64km', () => {
    expect(parseBasicIntent("40 miles on the bike")!.distance_km).toBe(64);
  });

  it('converts "10 mi" to 16km', () => {
    expect(parseBasicIntent("10 mi quick one")!.distance_km).toBe(16);
  });

  it("rounds decimal km", () => {
    expect(parseBasicIntent("12.5km loop")!.distance_km).toBe(13);
  });

  it("km wins over miles when both units appear", () => {
    expect(parseBasicIntent("60km (about 37 miles)")!.distance_km).toBe(60);
  });
});

describe("parseBasicIntent — duration + distance together / neither", () => {
  it("captures both when both are given", () => {
    const r = parseBasicIntent("60km in 2 hours");
    expect(r!.distance_km).toBe(60);
    expect(r!.duration_minutes).toBe(120);
  });

  it("returns null when neither duration nor distance is present", () => {
    expect(parseBasicIntent("a nice scenic ride please")).toBeNull();
    expect(parseBasicIntent("gravel loop from Skerries")).toBeNull();
    expect(parseBasicIntent("")).toBeNull();
  });
});

describe("parseBasicIntent — discipline detection", () => {
  it('detects "gravel"', () => {
    expect(parseBasicIntent("2 hour gravel ride")!.discipline).toBe("gravel");
  });

  it('detects "mtb"', () => {
    expect(parseBasicIntent("90 min mtb blast")!.discipline).toBe("mtb");
  });

  it('detects "mountain bike" as mtb', () => {
    expect(parseBasicIntent("60km mountain bike ride")!.discipline).toBe("mtb");
  });

  it("defaults to road", () => {
    expect(parseBasicIntent("2 hour spin")!.discipline).toBe("road");
  });

  it('does not match "gravelly" thanks to word boundary', () => {
    expect(parseBasicIntent("60km on gravelly-free tarmac")!.discipline).toBe("road");
  });
});

describe("parseBasicIntent — terrain / elevation preference", () => {
  it('detects "flat" and sets max elevation gain from distance', () => {
    const r = parseBasicIntent("60km flat loop");
    expect(r!.elevation_preference).toBe("flat");
    expect(r!.max_elevation_gain_m).toBe(300); // distance * 5
  });

  it('"no big climbs" also means flat', () => {
    const r = parseBasicIntent("40km with no big climbs");
    expect(r!.elevation_preference).toBe("flat");
    expect(r!.max_elevation_gain_m).toBe(200);
  });

  it("flat with only a duration leaves max_elevation_gain_m null", () => {
    const r = parseBasicIntent("2 hour flat ride");
    expect(r!.elevation_preference).toBe("flat");
    expect(r!.max_elevation_gain_m).toBeNull();
  });

  it('detects "rolling"', () => {
    const r = parseBasicIntent("60km rolling loop");
    expect(r!.elevation_preference).toBe("rolling");
    expect(r!.max_elevation_gain_m).toBeNull();
  });

  it('detects "hilly"', () => {
    expect(parseBasicIntent("2 hour hilly ride")!.elevation_preference).toBe("hilly");
  });

  it('"hills" also means hilly', () => {
    expect(parseBasicIntent("60km with some hills")!.elevation_preference).toBe("hilly");
  });

  it('"climbing" also means hilly', () => {
    expect(parseBasicIntent("60km with lots of climbing")!.elevation_preference).toBe("hilly");
  });

  it('detects "mountainous"', () => {
    expect(parseBasicIntent("100km mountainous epic")!.elevation_preference).toBe("mountainous");
  });

  it('defaults to "any" when no terrain mentioned', () => {
    expect(parseBasicIntent("60km loop")!.elevation_preference).toBe("any");
  });

  it('"mountain bike" does not read as mountainous terrain', () => {
    expect(parseBasicIntent("2 hour mountain bike ride")!.elevation_preference).toBe("any");
  });
});

describe("parseBasicIntent — wind strategy", () => {
  it('"tailwind home" → tailwind_home', () => {
    expect(parseBasicIntent("60km with a tailwind home")!.wind_strategy).toBe("tailwind_home");
  });

  it('"tailwind on the way home" → tailwind_home', () => {
    expect(parseBasicIntent("2 hour ride, tailwind on the way home")!.wind_strategy).toBe("tailwind_home");
  });

  it('"tailwind back" → tailwind_home', () => {
    expect(parseBasicIntent("60km loop with a tailwind back")!.wind_strategy).toBe("tailwind_home");
  });

  it('"headwind out" reads as tailwind_home (same loop orientation)', () => {
    expect(parseBasicIntent("2 hour ride, headwind out")!.wind_strategy).toBe("tailwind_home");
  });

  it('"headwind first" reads as tailwind_home', () => {
    expect(parseBasicIntent("60km, headwind first")!.wind_strategy).toBe("tailwind_home");
  });

  it('"tailwind to start" → tailwind_out', () => {
    expect(parseBasicIntent("90 min with a tailwind to start")!.wind_strategy).toBe("tailwind_out");
  });

  it('"tailwind out" → tailwind_out', () => {
    expect(parseBasicIntent("60km with the tailwind out")!.wind_strategy).toBe("tailwind_out");
  });

  it('no wind mention → "none"', () => {
    expect(parseBasicIntent("60km loop")!.wind_strategy).toBe("none");
  });

  it("wind matching is case-insensitive", () => {
    expect(parseBasicIntent("60km Tailwind Home")!.wind_strategy).toBe("tailwind_home");
  });
});

describe("parseBasicIntent — place extraction", () => {
  it('extracts "from Skerries"', () => {
    expect(parseBasicIntent("2 hour ride from Skerries")!.region).toBe("Skerries");
  });

  it("preserves the original casing of the place", () => {
    expect(parseBasicIntent("60km from Dún Laoghaire")!.region).toBe("Dún Laoghaire");
  });

  it('stops before trailing keywords: "from Port de Pollença with hills"', () => {
    const r = parseBasicIntent("3 hour ride from Port de Pollença with hills");
    expect(r!.region).toBe("Port de Pollença");
  });

  it("stops at a comma", () => {
    expect(parseBasicIntent("60km from Dingle, hilly please")!.region).toBe("Dingle");
  });

  it('stops before "tailwind"', () => {
    const r = parseBasicIntent("60km from Skerries tailwind home");
    expect(r!.region).toBe("Skerries");
    expect(r!.wind_strategy).toBe("tailwind_home");
  });

  it('stops before "and"', () => {
    expect(parseBasicIntent("2 hour from Howth and back")!.region).toBe("Howth");
  });

  it("stops before a number (\"from Skerries 60km\")", () => {
    expect(parseBasicIntent("ride from Skerries 60km")!.region).toBe("Skerries");
  });

  it('no "from" clause → region is null', () => {
    expect(parseBasicIntent("60km loop")!.region).toBeNull();
  });
});

describe("parseBasicIntent — loop vs point-to-point", () => {
  it("defaults to a loop", () => {
    expect(parseBasicIntent("60km ride")!.is_loop).toBe(true);
  });

  it('"point to point" → not a loop', () => {
    expect(parseBasicIntent("60km point to point")!.is_loop).toBe(false);
  });

  it('"A to B" → not a loop (case-insensitive)', () => {
    expect(parseBasicIntent("100km A to B ride")!.is_loop).toBe(false);
  });
});

describe("parseBasicIntent — structured fallback form", () => {
  it('parses "2 hour road loop, rolling terrain from Skerries" exactly', () => {
    const r = parseBasicIntent("2 hour road loop, rolling terrain from Skerries");
    expect(r).toEqual({
      distance_km: null,
      distance_tolerance_km: null,
      duration_minutes: 120,
      max_elevation_gain_m: null,
      elevation_preference: "rolling",
      discipline: "road",
      is_loop: true,
      road_preferences: ["tertiary", "unclassified", "residential"],
      avoid: ["motorway", "trunk"],
      vibes: [],
      region: "Skerries",
      country: "Ireland",
      wind_strategy: "none",
      cafe_stop: false,
      workout: null,
    });
  });

  it("applies safe cycling defaults on every parse", () => {
    const r = parseBasicIntent("60km loop")!;
    expect(r.road_preferences).toEqual(["tertiary", "unclassified", "residential"]);
    expect(r.avoid).toEqual(["motorway", "trunk"]);
    expect(r.vibes).toEqual([]);
    expect(r.country).toBe("Ireland");
    expect(r.workout).toBeNull();
    expect(r.distance_tolerance_km).toBeNull();
  });
});

describe("sanitizeWorkout — workout precision", () => {
  it("keeps 30-second efforts instead of rounding them to a minute", () => {
    const workout = sanitizeWorkout({
      intervals: [{
        count: 8,
        duration_minutes: 0.5,
        duration_seconds: 30,
        recovery_seconds: 150,
        zone: "z7",
        session_type: "sprint",
      }],
      warmup_minutes: 15,
      cooldown_minutes: 10,
      total_minutes: 0,
    });
    expect(workout?.intervals[0].duration_seconds).toBe(30);
    expect(workout?.intervals[0].duration_minutes).toBe(0.5);
    expect(workout?.intervals[0].recovery_seconds).toBe(150);
  });

  it("preserves sweet spot separately from tempo", () => {
    const workout = sanitizeWorkout({
      intervals: [{
        count: 3,
        duration_minutes: 12,
        zone: "z3",
        session_type: "sweet_spot",
      }],
      warmup_minutes: 15,
      cooldown_minutes: 10,
      total_minutes: 0,
    });
    expect(workout?.intervals[0].session_type).toBe("sweet_spot");
  });
});
