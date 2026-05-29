/**
 * Route Audit — flags problem routes in the database.
 *
 * Checks every route for:
 *   1. Non-loop (start/end > 3km apart)
 *   2. Excessive backtracking (< 25% unique roads)
 *   3. Too few points (< 20 GPS points — likely bad data)
 *   4. Suspiciously short (< 5km)
 *
 * Output: table of flagged routes with IDs, names, and issues.
 * Does NOT modify data — review-only.
 *
 * Run:
 *   node --env-file=.env.local scripts/audit-routes.mjs
 */

import { createPool } from "@vercel/postgres";

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error("❌ POSTGRES_URL not set.");
  process.exit(1);
}

const pool = createPool({ connectionString: POSTGRES_URL });

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sampleEvery(coords, intervalM) {
  if (coords.length < 2) return coords;
  const sampled = [coords[0]];
  let accum = 0;
  for (let i = 1; i < coords.length; i++) {
    accum += haversine(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]) * 1000;
    if (accum >= intervalM) {
      sampled.push(coords[i]);
      accum = 0;
    }
  }
  sampled.push(coords[coords.length - 1]);
  return sampled;
}

function uniqueRoadPct(coords) {
  const sampled = sampleEvery(coords, 200);
  if (sampled.length < 3) return 100;

  let uniqueKm = 0;
  let totalKm = 0;
  const visited = [sampled[0]];

  for (let i = 1; i < sampled.length; i++) {
    const segKm = haversine(sampled[i - 1][0], sampled[i - 1][1], sampled[i][0], sampled[i][1]);
    totalKm += segKm;
    const isNew = visited.every(
      (v) => haversine(sampled[i][0], sampled[i][1], v[0], v[1]) > 0.2
    );
    if (isNew) uniqueKm += segKm;
    visited.push(sampled[i]);
  }

  return totalKm > 0 ? (uniqueKm / totalKm) * 100 : 100;
}

async function audit() {
  console.log("🔍 Route Audit\n");

  const { rows } = await pool.query(
    `SELECT id, name, distance_km, county, country, coordinates, start_lat, start_lng
     FROM routes ORDER BY created_at DESC`
  );

  console.log(`Checking ${rows.length} routes...\n`);

  const issues = [];

  for (const route of rows) {
    const problems = [];
    let coords;
    try {
      coords = JSON.parse(route.coordinates);
    } catch {
      problems.push("CORRUPT_DATA: coordinates not valid JSON");
      issues.push({ id: route.id, name: route.name, problems });
      continue;
    }

    if (!Array.isArray(coords)) {
      problems.push("CORRUPT_DATA: coordinates is not an array");
      issues.push({ id: route.id, name: route.name, problems });
      continue;
    }

    // Check: too few points
    if (coords.length < 20) {
      problems.push(`LOW_POINTS: only ${coords.length} GPS points`);
    }

    // Check: suspiciously short
    if (route.distance_km < 5) {
      problems.push(`TOO_SHORT: ${route.distance_km} km`);
    }

    // Check: non-loop
    if (coords.length >= 2) {
      const first = coords[0];
      const last = coords[coords.length - 1];
      const gapKm = haversine(first[0], first[1], last[0], last[1]);
      if (gapKm > 3) {
        problems.push(`NOT_LOOP: start/end ${gapKm.toFixed(1)}km apart`);
      }
    }

    // Check: excessive backtracking
    if (coords.length >= 10) {
      const latLng = coords.map((c) => [c[0], c[1]]);
      const pct = uniqueRoadPct(latLng);
      if (pct < 25) {
        problems.push(`BACKTRACKING: only ${pct.toFixed(1)}% unique roads`);
      }
    }

    if (problems.length > 0) {
      issues.push({
        id: route.id,
        name: route.name,
        county: route.county,
        country: route.country,
        distance: route.distance_km,
        problems,
      });
    }
  }

  if (issues.length === 0) {
    console.log("✅ All routes passed audit checks.");
  } else {
    console.log(`⚠️  ${issues.length} route(s) flagged:\n`);
    for (const r of issues) {
      console.log(`  ${r.name} (${r.id})`);
      console.log(`    ${r.county}, ${r.country} · ${r.distance} km`);
      for (const p of r.problems) {
        console.log(`    ❌ ${p}`);
      }
      console.log(`    🔗 https://www.loops.ie/routes/${r.id}`);
      console.log();
    }
  }

  console.log(`\n📊 Summary: ${rows.length} checked, ${issues.length} flagged, ${rows.length - issues.length} clean`);
}

audit()
  .catch((e) => { console.error("Audit failed:", e); process.exit(1); })
  .finally(() => pool.end());
