#!/usr/bin/env node
/**
 * scripts/run-full-quality-audit.mjs
 *
 * Runs hard-rule GPS checks against every route in the production DB.
 * Checks (pure GPS, no OSM needed):
 *   1. MIN_DISTANCE   — road <15km, gravel <10km, mtb <5km (fatal)
 *   2. CONNECTIVITY   — any consecutive gap >500m (fatal)
 *   3. LOOP_CLOSURE   — start/end >3km apart (informational)
 *   4. OUT_AND_BACK   — >30% of route retraces same path (fatal)
 *
 * Then:
 *   - Adds quality_status column to routes table if it doesn't exist
 *   - Sets quality_status = 'approved' for passing routes
 *   - Sets quality_status = 'failed' for routes with fatal violations
 *
 * Usage:
 *   node scripts/run-full-quality-audit.mjs
 */

import { createPool } from '@vercel/postgres';

const DB_URL =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_NmxMEVUs4b9n@ep-square-violet-abmzjihi-pooler.eu-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

// ── Geometry helpers ────────────────────────────────────────────────────────

/** Haversine distance between two [lat, lng] points in kilometres. */
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Total route distance in km. */
function totalDistanceKm(coords) {
  let dist = 0;
  for (let i = 1; i < coords.length; i++) {
    dist += haversineKm(coords[i - 1], coords[i]);
  }
  return dist;
}

/** Sample coords every ~intervalMeters. */
function sampleCoords(coords, intervalMeters = 100) {
  if (coords.length < 2) return coords;
  const sampled = [coords[0]];
  let accumulated = 0;
  for (let i = 1; i < coords.length; i++) {
    accumulated += haversineKm(coords[i - 1], coords[i]) * 1000;
    if (accumulated >= intervalMeters) {
      sampled.push(coords[i]);
      accumulated = 0;
    }
  }
  const last = coords[coords.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

// ── Rule checks ──────────────────────────────────────────────────────────────

function checkMinDistance(coords, discipline) {
  const minimums = { road: 15, gravel: 10, mtb: 5 };
  const min = minimums[discipline] ?? 5;
  const dist = totalDistanceKm(coords);
  if (dist < min) {
    return `MIN_DISTANCE: ${dist.toFixed(1)}km < ${min}km for ${discipline}`;
  }
  return null;
}

function checkConnectivity(coords) {
  const GAP_KM = 0.5;
  for (let i = 1; i < coords.length; i++) {
    const d = haversineKm(coords[i - 1], coords[i]);
    if (d > GAP_KM) {
      return `CONNECTIVITY: ${(d * 1000).toFixed(0)}m gap between points ${i - 1}→${i}`;
    }
  }
  return null;
}

/** Returns km gap between first and last point. */
function loopClosureGapKm(coords) {
  if (coords.length < 2) return 0;
  return haversineKm(coords[0], coords[coords.length - 1]);
}

/**
 * Estimate the fraction of the route that retraces its own path.
 * Uses 100m sampled points and a 30m proximity threshold.
 * Returns a percentage 0–100.
 */
function outAndBackPct(coords) {
  if (coords.length < 10) return 0;

  const sampled = sampleCoords(coords, 100);
  if (sampled.length < 5) return 0;

  // Accumulate path distances
  const pathDist = [0];
  for (let i = 1; i < sampled.length; i++) {
    pathDist[i] = pathDist[i - 1] + haversineKm(sampled[i - 1], sampled[i]);
  }

  const PROXIMITY_KM = 0.03;          // 30m — same road
  const MIN_PATH_SEP_KM = 0.5;        // must be 500m apart in path distance
  let retracedKm = 0;

  for (let i = 5; i < sampled.length; i++) {
    const pt = sampled[i];
    for (let j = 0; j < i - 1; j++) {
      if (pathDist[i] - pathDist[j] < MIN_PATH_SEP_KM) continue;
      if (haversineKm(pt, sampled[j]) < PROXIMITY_KM) {
        retracedKm += (pathDist[i] - pathDist[j]) / 2;
        break;
      }
    }
  }

  const total = pathDist[pathDist.length - 1];
  if (total === 0) return 0;
  return Math.min(100, (retracedKm / total) * 100);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const pool = createPool({ connectionString: DB_URL });

  console.log('Connecting to database…');

  // 1. Add quality_status column if missing
  await pool.query(`
    ALTER TABLE routes
    ADD COLUMN IF NOT EXISTS quality_status TEXT DEFAULT 'pending'
  `);
  console.log('quality_status column ensured.\n');

  // 2. Fetch all routes
  const { rows: routes } = await pool.query(`
    SELECT id, name, slug, discipline, distance_km, coordinates
    FROM routes
    ORDER BY name
  `);

  console.log(`Auditing ${routes.length} routes…\n`);

  // Table header
  const COL = {
    name: 42,
    disc: 7,
    dist: 8,
    loop: 10,
    oab: 9,
    ok: 8,
    reason: 0,
  };
  const header = [
    'Route'.padEnd(COL.name),
    'Disc'.padEnd(COL.disc),
    'Dist(km)'.padEnd(COL.dist),
    'LoopGap'.padEnd(COL.loop),
    'OAB%'.padEnd(COL.oab),
    'Status'.padEnd(COL.ok),
    'Reason',
  ].join(' | ');
  console.log(header);
  console.log('-'.repeat(header.length));

  const results = [];

  for (const route of routes) {
    let coords;
    try {
      const parsed = JSON.parse(route.coordinates);
      // Normalise: strip elevation if present, keep [lat, lng]
      coords = parsed.map((pt) => [pt[0], pt[1]]);
    } catch {
      results.push({
        id: route.id,
        status: 'failed',
        reason: 'PARSE_ERROR: could not parse coordinates JSON',
        name: route.name,
        discipline: route.discipline,
        distance_km: route.distance_km,
        loopGapKm: null,
        oabPct: null,
      });
      continue;
    }

    if (coords.length < 2) {
      results.push({
        id: route.id,
        status: 'failed',
        reason: 'EMPTY: fewer than 2 coordinate points',
        name: route.name,
        discipline: route.discipline,
        distance_km: route.distance_km,
        loopGapKm: null,
        oabPct: null,
      });
      continue;
    }

    const fatalReasons = [];
    const warnings = [];

    // Fatal checks
    const minDistErr = checkMinDistance(coords, route.discipline);
    if (minDistErr) fatalReasons.push(minDistErr);

    const connErr = checkConnectivity(coords);
    if (connErr) fatalReasons.push(connErr);

    // Informational
    const loopGapKm = loopClosureGapKm(coords);
    const oabPct = outAndBackPct(coords);

    // Out-and-back > 30% is fatal
    if (oabPct > 30) {
      fatalReasons.push(`OUT_AND_BACK: ${oabPct.toFixed(1)}% of route retraces itself`);
    }

    // Loop closure > 3km is a warning (not all routes are loops)
    if (loopGapKm > 3) {
      warnings.push(`LOOP_OPEN: start/end ${loopGapKm.toFixed(1)}km apart`);
    }

    const status = fatalReasons.length > 0 ? 'failed' : 'approved';
    const reason =
      fatalReasons.length > 0
        ? fatalReasons.join('; ')
        : warnings.length > 0
        ? warnings.join('; ')
        : 'OK';

    results.push({
      id: route.id,
      status,
      reason,
      name: route.name,
      discipline: route.discipline,
      distance_km: route.distance_km,
      loopGapKm,
      oabPct,
    });

    // Print table row
    const nameTrunc = (route.name || '').slice(0, COL.name - 1).padEnd(COL.name);
    const disc = (route.discipline || '').padEnd(COL.disc);
    const dist = route.distance_km.toFixed(1).padEnd(COL.dist);
    const loopStr = loopGapKm !== null ? `${loopGapKm.toFixed(1)}km`.padEnd(COL.loop) : 'N/A'.padEnd(COL.loop);
    const oabStr = oabPct !== null ? `${oabPct.toFixed(1)}%`.padEnd(COL.oab) : 'N/A'.padEnd(COL.oab);
    const statusStr = (status === 'approved' ? '✓ PASS' : '✗ FAIL').padEnd(COL.ok);
    const reasonShort = reason.slice(0, 80);
    console.log(`${nameTrunc} | ${disc} | ${dist} | ${loopStr} | ${oabStr} | ${statusStr} | ${reasonShort}`);
  }

  // Summary
  const passed = results.filter((r) => r.status === 'approved').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  console.log('\n' + '='.repeat(80));
  console.log(`SUMMARY: ${passed} approved, ${failed} failed, ${results.length} total`);
  console.log('='.repeat(80) + '\n');

  if (failed > 0) {
    console.log('FAILED ROUTES:');
    results
      .filter((r) => r.status === 'failed')
      .forEach((r) => console.log(`  ✗ ${r.name} (${r.discipline}, ${r.distance_km}km)\n    → ${r.reason}`));
    console.log('');
  }

  // 3. Update quality_status in DB
  console.log('Writing quality_status to database…');

  // Batch updates: approved batch
  const approvedIds = results.filter((r) => r.status === 'approved').map((r) => r.id);
  const failedIds = results.filter((r) => r.status === 'failed').map((r) => r.id);

  if (approvedIds.length > 0) {
    await pool.query(
      `UPDATE routes SET quality_status = 'approved' WHERE id = ANY($1::text[])`,
      [approvedIds]
    );
    console.log(`  Marked ${approvedIds.length} routes as 'approved'`);
  }

  if (failedIds.length > 0) {
    await pool.query(
      `UPDATE routes SET quality_status = 'failed' WHERE id = ANY($1::text[])`,
      [failedIds]
    );
    console.log(`  Marked ${failedIds.length} routes as 'failed'`);
  }

  // Add index for fast filtering
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_routes_quality_status ON routes(quality_status)`
  );
  console.log('  Index on quality_status ensured.');

  console.log('\nDone.');
  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
