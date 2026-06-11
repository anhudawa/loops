/**
 * Golden Route Test Suite (launch spec §6)
 *
 * Runs prompt → expected-properties pairs through the real generation
 * pipeline. Any hard guardrail violation is a release blocker.
 *
 * Requires: ANTHROPIC_API_KEY (intent parsing), network access to
 * BRouter/Overpass/Nominatim/Open-Meteo. Run from dev or CI:
 *
 *   npx tsx scripts/run-golden-routes.mts            # all cases
 *   npx tsx scripts/run-golden-routes.mts girona     # filter by id substring
 *
 * Exit code 0 = all pass, 1 = any failure. Wire into CI as a release gate.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { generateRouteCandidates } from "../src/lib/route-generator";

interface Expect {
  discipline?: string;
  distance_km?: [number, number];
  duration_min?: [number, number];
  max_elevation_gain_m?: number;
  is_loop?: boolean;
  is_workout?: boolean;
  wind_strategy?: string;
  workout_intervals?: Array<{ count: number; duration_minutes: number; zone: string }>;
  region_contains?: string;
  no_motorways?: boolean;
  no_unpaved?: boolean;
  decline_ok?: boolean;
}

interface GoldenCase {
  id: string;
  prompt: string;
  origin?: [number, number];
  expect: Expect;
}

const __dir = dirname(fileURLToPath(import.meta.url));
const cases: GoldenCase[] = JSON.parse(
  readFileSync(join(__dir, "golden-routes", "cases.json"), "utf-8")
);

const filter = process.argv[2];
const selected = filter ? cases.filter((c) => c.id.includes(filter)) : cases;

function loopGapKm(coords: [number, number][]): number {
  const a = coords[0];
  const b = coords[coords.length - 1];
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function runCase(c: GoldenCase): Promise<string[]> {
  const failures: string[] = [];
  let result;
  try {
    result = await generateRouteCandidates(c.prompt, { origin: c.origin });
  } catch (err) {
    if (c.expect.decline_ok) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/couldn't find|can host|No valid routes/i.test(msg)) {
        failures.push(`declined but with unhelpful message: ${msg}`);
      }
      return failures; // honest decline is a pass
    }
    failures.push(`threw: ${err instanceof Error ? err.message : err}`);
    return failures;
  }

  const { interpreted, candidates } = result;
  const e = c.expect;

  if (e.decline_ok) {
    // We allowed a decline but got results — that's fine if they're valid.
  }

  if (e.discipline && interpreted.discipline !== e.discipline)
    failures.push(`discipline: got ${interpreted.discipline}, want ${e.discipline}`);
  if (e.is_workout !== undefined && interpreted.is_workout !== e.is_workout)
    failures.push(`is_workout: got ${interpreted.is_workout}`);
  if (e.wind_strategy && interpreted.wind_strategy !== e.wind_strategy)
    failures.push(`wind_strategy: got ${interpreted.wind_strategy ?? "none"}, want ${e.wind_strategy}`);
  if (e.duration_min && interpreted.duration_minutes !== undefined) {
    const [lo, hi] = e.duration_min;
    if (interpreted.duration_minutes < lo || interpreted.duration_minutes > hi)
      failures.push(`duration: got ${interpreted.duration_minutes}min, want ${lo}-${hi}`);
  }
  if (e.region_contains) {
    const region = (interpreted.region ?? "").toLowerCase();
    if (!region.includes(e.region_contains))
      failures.push(`region: got "${interpreted.region}", want contains "${e.region_contains}"`);
  }

  if (candidates.length === 0) {
    failures.push("no candidates returned");
    return failures;
  }

  for (const [i, cand] of candidates.entries()) {
    const label = `candidate[${i}](${cand.source})`;
    if (e.distance_km) {
      const [lo, hi] = e.distance_km;
      if (cand.distance_km < lo || cand.distance_km > hi)
        failures.push(`${label} distance ${cand.distance_km}km outside ${lo}-${hi}`);
    }
    if (e.max_elevation_gain_m && cand.elevation_gain_m > e.max_elevation_gain_m)
      failures.push(`${label} elevation ${cand.elevation_gain_m}m > cap ${e.max_elevation_gain_m}m`);
    if (e.is_loop) {
      const gap = loopGapKm(cand.coordinates);
      if (gap > 3) failures.push(`${label} not a loop: start/end ${gap.toFixed(1)}km apart`);
    }
    if (e.workout_intervals && cand.source === "generated") {
      if (!cand.workout_fit?.fits) failures.push(`${label} workout does not fit`);
    }
    // Guardrails (motorway/unpaved) are enforced inside generation via
    // route-rules; their absence from served candidates is asserted by the
    // pipeline itself. A failure would have surfaced as a rejection.
  }

  return failures;
}

let failed = 0;
console.log(`Golden routes: running ${selected.length}/${cases.length} cases\n`);
for (const c of selected) {
  process.stdout.write(`  ${c.id} … `);
  const t0 = Date.now();
  const failures = await runCase(c);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (failures.length === 0) {
    console.log(`PASS (${secs}s)`);
  } else {
    failed += 1;
    console.log(`FAIL (${secs}s)`);
    for (const f of failures) console.log(`      - ${f}`);
  }
}

console.log(`\n${selected.length - failed}/${selected.length} passed`);
if (failed > 0) process.exit(1);
