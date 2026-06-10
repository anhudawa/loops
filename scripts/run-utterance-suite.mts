/**
 * Utterance Parse-Accuracy Suite (launch spec §2)
 *
 * Tests the natural-language → RouteSpec parser against realistic phrasing
 * variation, including corrections. Parser-only — fast and cheap compared
 * to the full golden suite (no routing, no Overpass).
 *
 * Requires ANTHROPIC_API_KEY. Geocoding calls Nominatim (network).
 * Launch gate: 95%+ pass rate.
 *
 *   npx tsx scripts/run-utterance-suite.mts
 *   npx tsx scripts/run-utterance-suite.mts wind   # filter by id substring
 *
 * Note: accent robustness (Irish/British/American/Australian audio) must be
 * tested at the speech-to-text layer with recorded audio on real devices —
 * this suite covers the text-understanding layer.
 */

import { parseRouteIntent } from "../src/lib/route-intent";

interface Case {
  id: string;
  utterance: string;
  expect: {
    discipline?: string;
    duration_minutes?: [number, number];
    distance_km?: [number, number];
    elevation_preference?: string | string[];
    wind_strategy?: string;
    is_loop?: boolean;
    workout_count?: number;
    workout_zone?: string;
    workout_duration?: number;
    region_contains?: string;
    country?: string;
  };
}

const CASES: Case[] = [
  // ── Duration & distance phrasings ──
  { id: "dur-plain", utterance: "find me a three hour loop on quiet roads with little elevation", expect: { duration_minutes: [170, 190], elevation_preference: "flat", is_loop: true } },
  { id: "dur-90min", utterance: "90 minutes easy spinning", expect: { duration_minutes: [85, 95] } },
  { id: "dur-couple", utterance: "a couple of hours on the bike, nothing mad", expect: { duration_minutes: [100, 140] } },
  { id: "dist-plain", utterance: "60km road loop", expect: { distance_km: [55, 65], discipline: "road", is_loop: true } },
  { id: "dist-miles", utterance: "a 40 mile spin on the road bike", expect: { distance_km: [58, 72], discipline: "road" } },
  { id: "dist-metric-ton", utterance: "I want to do a metric century today", expect: { distance_km: [95, 105] } },
  { id: "correction-shorter", utterance: "3 hour loop from Girona... actually make it two hours", expect: { duration_minutes: [110, 130], region_contains: "girona" } },
  { id: "correction-surface", utterance: "60km gravel ride — wait, no, road bike today", expect: { discipline: "road" } },

  // ── Elevation phrasings ──
  { id: "elev-flat", utterance: "2 hours, flat as a pancake please", expect: { elevation_preference: "flat" } },
  { id: "elev-rolling", utterance: "rolling 80k with a few lumps", expect: { elevation_preference: ["rolling", "hilly"], distance_km: [70, 90] } },
  { id: "elev-climbing", utterance: "I want a proper climbing day, 100k in the mountains", expect: { elevation_preference: ["hilly", "mountainous"] } },
  { id: "elev-avoid", utterance: "keep it easy, no big climbs, 50km", expect: { elevation_preference: "flat" } },

  // ── Wind ──
  { id: "wind-home", utterance: "3 hour loop, tailwind on the way home", expect: { wind_strategy: "tailwind_home" } },
  { id: "wind-home-alt", utterance: "long ride with the wind at my back coming home", expect: { wind_strategy: "tailwind_home" } },
  { id: "wind-headwind-out", utterance: "80km, into the wind first so the way back is easy", expect: { wind_strategy: "tailwind_home" } },
  { id: "wind-out", utterance: "give me a tailwind to start, I'll suffer home", expect: { wind_strategy: "tailwind_out" } },
  { id: "wind-none", utterance: "2 hour rolling loop from Malahide", expect: { wind_strategy: "none" } },

  // ── Discipline ──
  { id: "disc-gravel", utterance: "2 hours off road on the gravel bike", expect: { discipline: "gravel" } },
  { id: "disc-mtb", utterance: "mountain bike loop, 25k of trails", expect: { discipline: "mtb" } },
  { id: "disc-default", utterance: "nice 2 hour spin somewhere scenic", expect: { discipline: "road" } },

  // ── Workouts ──
  { id: "wo-2x20", utterance: "2 hour zone 2 ride with 2 x 20 minute zone 4 efforts", expect: { workout_count: 2, workout_zone: "z4", workout_duration: 20 } },
  { id: "wo-threshold", utterance: "2x20 threshold somewhere safe", expect: { workout_count: 2, workout_zone: "z4", workout_duration: 20 } },
  { id: "wo-vo2", utterance: "5 by 5 vo2 max with full recovery", expect: { workout_count: 5, workout_zone: "z5", workout_duration: 5 } },
  { id: "wo-sweetspot", utterance: "sweet spot 2 x 30, flat roads", expect: { workout_count: 2, workout_zone: "z3", workout_duration: 30, elevation_preference: "flat" } },
  { id: "wo-overunder", utterance: "3 sets of 10 minute over-unders with 5 minutes easy between", expect: { workout_count: 3, workout_duration: 10 } },

  // ── Places ──
  { id: "place-from", utterance: "2 hour loop from Skerries", expect: { region_contains: "skerries", country: "Ireland" } },
  { id: "place-abroad", utterance: "80km from Alcudia with one big climb", expect: { country: "Spain" } },
  { id: "place-nice", utterance: "3 hours from Nice, up Col d'Eze", expect: { country: "France" } },
  { id: "place-none", utterance: "just give me 2 hours easy", expect: { duration_minutes: [110, 130] } },

  // ── Loop vs point-to-point ──
  { id: "loop-default", utterance: "100km on quiet roads", expect: { is_loop: true } },
  { id: "p2p", utterance: "point to point from Dublin to Drogheda", expect: { is_loop: false } },
];

const filter = process.argv[2];
const selected = filter ? CASES.filter((c) => c.id.includes(filter)) : CASES;

function inRange(v: number | undefined, [lo, hi]: [number, number]): boolean {
  return v !== undefined && v >= lo && v <= hi;
}

let failed = 0;
console.log(`Utterance suite: ${selected.length}/${CASES.length} cases\n`);
for (const c of selected) {
  process.stdout.write(`  ${c.id} … `);
  const failures: string[] = [];
  try {
    const spec = await parseRouteIntent(c.utterance);
    const e = c.expect;
    if (e.discipline && spec.discipline !== e.discipline)
      failures.push(`discipline ${spec.discipline} ≠ ${e.discipline}`);
    if (e.duration_minutes && !inRange(spec.duration_minutes, e.duration_minutes))
      failures.push(`duration ${spec.duration_minutes} ∉ [${e.duration_minutes}]`);
    if (e.distance_km && !inRange(spec.distance_km, e.distance_km))
      failures.push(`distance ${spec.distance_km} ∉ [${e.distance_km}]`);
    if (e.elevation_preference) {
      const allowed = Array.isArray(e.elevation_preference) ? e.elevation_preference : [e.elevation_preference];
      if (!allowed.includes(spec.elevation_preference))
        failures.push(`elevation ${spec.elevation_preference} ∉ {${allowed}}`);
    }
    if (e.wind_strategy && spec.wind_strategy !== e.wind_strategy)
      failures.push(`wind ${spec.wind_strategy} ≠ ${e.wind_strategy}`);
    if (e.is_loop !== undefined && spec.is_loop !== e.is_loop)
      failures.push(`is_loop ${spec.is_loop}`);
    if (e.country && spec.country !== e.country)
      failures.push(`country ${spec.country} ≠ ${e.country}`);
    if (e.region_contains && !(spec.region ?? "").toLowerCase().includes(e.region_contains))
      failures.push(`region "${spec.region}" misses "${e.region_contains}"`);
    if (e.workout_count !== undefined) {
      const iv = spec.workout?.intervals?.[0];
      if (!iv) failures.push("no workout parsed");
      else {
        if (iv.count !== e.workout_count) failures.push(`workout count ${iv.count} ≠ ${e.workout_count}`);
        if (e.workout_zone && iv.zone !== e.workout_zone) failures.push(`zone ${iv.zone} ≠ ${e.workout_zone}`);
        if (e.workout_duration && iv.duration_minutes !== e.workout_duration)
          failures.push(`interval ${iv.duration_minutes}min ≠ ${e.workout_duration}`);
      }
    }
  } catch (err) {
    failures.push(`threw: ${err instanceof Error ? err.message : err}`);
  }
  if (failures.length === 0) console.log("PASS");
  else {
    failed += 1;
    console.log("FAIL");
    for (const f of failures) console.log(`      - ${f}`);
  }
}

const passRate = ((selected.length - failed) / selected.length) * 100;
console.log(`\n${selected.length - failed}/${selected.length} passed (${passRate.toFixed(1)}%) — launch gate is 95%`);
if (passRate < 95) process.exit(1);
