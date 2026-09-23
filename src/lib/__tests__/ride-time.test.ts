import { describe, it, expect } from "vitest";
import {
  CLIMB_KM_PER_100M,
  CRUISE_SPEED_KMH,
  DEFAULT_SPEED_KMH,
  DURATION_TIERS,
  MAX_SPEED_KMH,
  MIN_SPEED_KMH,
} from "@/config/constants";
import {
  clampSpeedKmh,
  cruiseSpeedKmh,
  estimateRideMinutes,
  formatRideTime,
  rideMinutesSql,
  rideTimeSentence,
  roundRideMinutes,
} from "@/lib/ride-time";
import { buildRouteFaqs } from "@/lib/seo";

/** Which DURATION_TIERS bucket the raw minutes fall in (the db.ts filter). */
function tierOf(minutes: number): string {
  for (const [key, tier] of Object.entries(DURATION_TIERS)) {
    const min = "minMinutes" in tier ? tier.minMinutes : -Infinity;
    const max = "maxMinutes" in tier ? tier.maxMinutes : Infinity;
    if (minutes >= min && minutes <= max) return key;
  }
  throw new Error(`no tier for ${minutes}`);
}

/**
 * Evaluate the SQL twin in JS for one row: substitute the row's columns and
 * the bound speed, resolve the CASE by hand, and eval the arithmetic.
 */
function evalSql(row: { distance_km: number; elevation_gain_m: number; discipline: string }, speed: number): number {
  let sql = rideMinutesSql("$1");
  const caseMatch = sql.match(/\(CASE r\.discipline (.*?) ELSE (\d+) END\)/);
  if (!caseMatch) throw new Error("no CASE in SQL");
  const whens = new Map<string, number>();
  for (const m of caseMatch[1].matchAll(/WHEN '(\w+)' THEN (\d+)/g)) whens.set(m[1], Number(m[2]));
  const cruise = whens.get(row.discipline) ?? Number(caseMatch[2]);
  sql = sql
    .replace(caseMatch[0], String(cruise))
    .replace(/r\.distance_km/g, String(row.distance_km))
    .replace(/r\.elevation_gain_m/g, String(row.elevation_gain_m))
    .replace(/\$1::numeric/g, String(speed));
  expect(sql).toMatch(/^[\d\s.()+*/-]+$/); // nothing but arithmetic left
  return new Function(`return ${sql}`)() as number;
}

const ROADMAN = { distance_km: 83.4, elevation_gain_m: 554, discipline: "road" };

// The calibration table from the owner's feedback ("not 4.40 hrs, maybe 3.5").
const CALIBRATION = [
  {
    name: "Roadman Group Spin (Saturday Route)",
    ...ROADMAN,
    minutes: 213,
    card: "~3½h",
    tier: "3h",
    faq: "Allow around 3½ hours of riding at a steady club pace (about 25 km/h on the flat). Coffee stops and a headwind go on top.",
  },
  {
    name: "Club coffee spin",
    distance_km: 40, elevation_gain_m: 150, discipline: "road",
    minutes: 100,
    card: "~1¾h",
    tier: "2h",
    faq: "Allow around 1¾ hours of riding at a steady club pace (about 25 km/h on the flat). Coffee stops and a headwind go on top.",
  },
  {
    name: "Sa Calobra loop",
    distance_km: 100, elevation_gain_m: 2500, discipline: "road",
    minutes: 300,
    card: "~5h",
    tier: "4h+",
    faq: "Allow 4½–5½ hours of riding at a steady club pace (about 25 km/h on the flat) — the climbs decide where you land. Stops go on top.",
  },
  {
    name: "Wicklow 200",
    distance_km: 200, elevation_gain_m: 3400, discipline: "road",
    minutes: 562,
    card: "~9½h",
    tier: "4h+",
    faq: "Allow 9–10 hours of riding at a steady club pace (about 25 km/h on the flat) — a long day; the climbs and how you fuel decide where you land. Stops go on top.",
  },
  {
    name: "Gravel",
    distance_km: 60, elevation_gain_m: 900, discipline: "gravel",
    minutes: 218,
    card: "~3½h",
    tier: "3h",
    faq: "Allow around 3½ hours of riding at a steady gravel pace (about 19 km/h). Stops go on top.",
  },
  {
    name: "MTB",
    distance_km: 30, elevation_gain_m: 700, discipline: "mtb",
    minutes: 171,
    card: "~2¾h",
    tier: "3h",
    faq: "Allow around 2¾ hours of riding at a steady trail pace (about 13 km/h). Stops go on top.",
  },
  {
    name: "Short flat",
    distance_km: 25, elevation_gain_m: 50, discipline: "road",
    minutes: 61,
    card: "~1h",
    tier: "1h",
    faq: "Allow around 1 hour of riding at a steady club pace (about 25 km/h on the flat). Coffee stops and a headwind go on top.",
  },
];

describe("estimateRideMinutes — calibration routes", () => {
  it.each(CALIBRATION)("$name → $minutes min, $card, tier $tier", (c) => {
    const minutes = estimateRideMinutes(c);
    expect(minutes).toBe(c.minutes);
    expect(formatRideTime(minutes, { style: "card" })).toBe(c.card);
    expect(tierOf(minutes)).toBe(c.tier);
    expect(rideTimeSentence(c)).toBe(c.faq);
  });

  it("the Roadman spin is no longer 4 h 43 anywhere", () => {
    const faq = buildRouteFaqs({ name: "Roadman Group Spin (Saturday Route)", surface_type: "Road", ...ROADMAN });
    const answer = faq.find((f) => f.question.startsWith("How long"))!.answer;
    expect(answer).toBe(
      "Roadman Group Spin (Saturday Route) is 83.4 km with 554 m of climbing. Allow around 3½ hours of riding at a steady club pace (about 25 km/h on the flat). Coffee stops and a headwind go on top."
    );
    expect(answer).not.toMatch(/\d+ hours \d+ minutes/);
    expect(answer).not.toMatch(/Most riders|depending on/);
  });
});

describe("estimateRideMinutes — the rider's own speed", () => {
  it("times the Roadman spin at a rider's 30 km/h", () => {
    const minutes = estimateRideMinutes({ ...ROADMAN, avgSpeedKmh: 30 });
    expect(minutes).toBe(178);
    expect(formatRideTime(minutes, { style: "card" })).toBe("~3h");
    expect(tierOf(minutes)).toBe("3h");
    expect(rideTimeSentence({ ...ROADMAN, avgSpeedKmh: 30 })).toBe("Allow around 3 hours of riding at your 30 km/h.");
  });

  it("times the Roadman spin at a rider's 20 km/h", () => {
    const minutes = estimateRideMinutes({ ...ROADMAN, avgSpeedKmh: 20 });
    expect(minutes).toBe(267);
    expect(formatRideTime(minutes, { style: "card" })).toBe("~4½h");
    expect(tierOf(minutes)).toBe("4h+");
    expect(rideTimeSentence({ ...ROADMAN, avgSpeedKmh: 20 })).toBe("Allow around 4½ hours of riding at your 20 km/h.");
  });

  it("on road the rider's speed is a straight replacement of the default", () => {
    expect(cruiseSpeedKmh("road", 30)).toBe(30);
    expect(cruiseSpeedKmh("road")).toBe(DEFAULT_SPEED_KMH);
  });

  it("on gravel/mtb the discipline default scales by the same ratio", () => {
    expect(cruiseSpeedKmh("gravel", 30)).toBeCloseTo(19 * 1.2);
    expect(cruiseSpeedKmh("mtb", 30)).toBeCloseTo(13 * 1.2);
    // A 30 km/h roadie is never timed at 30 km/h on an MTB loop.
    expect(estimateRideMinutes({ distance_km: 30, elevation_gain_m: 700, discipline: "mtb", avgSpeedKmh: 30 })).toBeGreaterThan(
      estimateRideMinutes({ distance_km: 30, elevation_gain_m: 700, discipline: "road", avgSpeedKmh: 30 })
    );
  });

  it("clamps the rider's speed to the profile bounds and falls back to the default", () => {
    expect(clampSpeedKmh(5)).toBe(MIN_SPEED_KMH);
    expect(clampSpeedKmh(99)).toBe(MAX_SPEED_KMH);
    expect(clampSpeedKmh(undefined)).toBe(DEFAULT_SPEED_KMH);
    expect(clampSpeedKmh(NaN)).toBe(DEFAULT_SPEED_KMH);
  });

  it("treats unknown disciplines as mixed", () => {
    expect(cruiseSpeedKmh("mixed")).toBe(CRUISE_SPEED_KMH.mixed);
    expect(cruiseSpeedKmh(undefined)).toBe(CRUISE_SPEED_KMH.mixed);
    expect(cruiseSpeedKmh("cyclocross")).toBe(CRUISE_SPEED_KMH.mixed);
  });
});

describe("display rounding", () => {
  it("never prints minutes past the hour once over an hour", () => {
    expect(formatRideTime(283, { style: "card" })).toBe("~4½h");
    expect(formatRideTime(255, { style: "card" })).toBe("~4½h");
    expect(formatRideTime(208, { style: "prose" })).toBe("around 3½ hours");
    expect(formatRideTime(283, { style: "prose" })).not.toMatch(/minutes/);
  });

  it("rounds to 5 min under an hour, a quarter hour to 3 h, a half hour above", () => {
    expect(roundRideMinutes(48)).toBe(50);
    expect(formatRideTime(48, { style: "card" })).toBe("~50 min");
    expect(formatRideTime(48, { style: "prose" })).toBe("around 50 minutes");
    expect(roundRideMinutes(70)).toBe(75);
    expect(formatRideTime(70, { style: "prose" })).toBe("around 1¼ hours");
    expect(formatRideTime(88, { style: "card" })).toBe("~1½h");
    expect(roundRideMinutes(178)).toBe(180);
    expect(formatRideTime(178, { style: "prose" })).toBe("around 3 hours");
    expect(roundRideMinutes(196)).toBe(210);
  });

  it("widens prose to a range from 5 h; cards keep the single point", () => {
    expect(formatRideTime(300, { style: "prose" })).toBe("4½–5½ hours");
    expect(formatRideTime(562, { style: "prose" })).toBe("9–10 hours");
    expect(formatRideTime(562, { style: "prose", range: false })).toBe("around 9½ hours");
    expect(formatRideTime(299, { style: "prose" })).toBe("around 5 hours");
    expect(formatRideTime(562, { style: "card" })).toBe("~9½h");
  });

  it("card style can drop the tilde for the rider's own ask", () => {
    expect(formatRideTime(120, { style: "card", approx: false })).toBe("2h");
    expect(formatRideTime(90, { style: "card", approx: false })).toBe("1½h");
  });
});

describe("rideMinutesSql — the db.ts twin", () => {
  it("is built from the same constants as the TypeScript model", () => {
    const sql = rideMinutesSql("$3");
    expect(sql).toContain(`WHEN 'gravel' THEN ${CRUISE_SPEED_KMH.gravel}`);
    expect(sql).toContain(`WHEN 'mtb' THEN ${CRUISE_SPEED_KMH.mtb}`);
    expect(sql).toContain(`WHEN 'mixed' THEN ${CRUISE_SPEED_KMH.mixed}`);
    expect(sql).toContain(`ELSE ${CRUISE_SPEED_KMH.road} END`);
    expect(sql).toContain(`* ${CLIMB_KM_PER_100M} / 100.0`);
    expect(sql).toContain(`$3::numeric / ${DEFAULT_SPEED_KMH}.0`);
    expect(CRUISE_SPEED_KMH.road).toBe(DEFAULT_SPEED_KMH);
  });

  it.each(CALIBRATION)("$name: SQL and TS agree at the default pace", (c) => {
    expect(Math.round(evalSql(c, DEFAULT_SPEED_KMH))).toBe(estimateRideMinutes(c));
  });

  it("SQL and TS agree at a rider's own speed, on every discipline", () => {
    for (const speed of [20, 30, 45]) {
      for (const discipline of ["road", "gravel", "mtb", "mixed"]) {
        const row = { distance_km: 83.4, elevation_gain_m: 554, discipline };
        expect(Math.round(evalSql(row, speed))).toBe(estimateRideMinutes({ ...row, avgSpeedKmh: speed }));
      }
    }
  });
});
