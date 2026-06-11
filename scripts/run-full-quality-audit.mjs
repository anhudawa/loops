#!/usr/bin/env node
/**
 * scripts/run-full-quality-audit.mjs
 *
 * Runs hard-rule GPS checks against every route in the production DB.
 * Checks (pure GPS, no OSM needed):
 *   1. MIN_DISTANCE   — road <15km, gravel <10km, mtb <5km (fatal)
 *   2. CONNECTIVITY   — any consecutive gap >500m (fatal)
 *   3. LOOP_CLOSURE   — start/end >3km apart (informational)
 *   4. OUT_AND_BACK   — unique road % <15% (no meaningful loop section) (fatal)
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

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!DB_URL) {
  console.error('DATABASE_URL/POSTGRES_URL not set. Run with: node --env-file=.env.local scripts/run-full-quality-audit.mjs');
  process.exit(1);
}

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
 * Calculate what percentage of total route distance is on unique roads
 * (never previously visited, >200m from any prior point).
 *
 * Routes with a meaningful loop section score ≥15%.
 * Pure out-and-backs score near 0%.
 * Returns a percentage 0–100.
 */
function uniqueMiddlePct(coords) {
  if (coords.length < 10) return 100;

  const sampled = sampleCoords(coords, 200);
  if (sampled.length < 3) return 100;

  const UNIQUE_THRESHOLD_KM = 0.2; // 200m — new road if further than this

  let uniqueKm = 0;
  let totalKm = 0;
  const visited = [sampled[0]];

  for (let i = 1; i < sampled.length; i++) {
    const segmentKm = haversineKm(sampled[i - 1], sampled[i]);
    totalKm += segmentKm;

    const isNew = visited.every((v) => haversineKm(sampled[i], v) > UNIQUE_THRESHOLD_KM);
    if (isNew) uniqueKm += segmentKm;

    visited.push(sampled[i]);
  }

  if (totalKm === 0) return 100;
  return (uniqueKm / totalKm) * 100;
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
    unique: 10,
    ok: 8,
    reason: 0,
  };
  const header = [
    'Route'.padEnd(COL.name),
    'Disc'.padEnd(COL.disc),
    'Dist(km)'.padEnd(COL.dist),
    'LoopGap'.padEnd(COL.loop),
    'Unique%'.padEnd(COL.unique),
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
        uniquePct: null,
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
        uniquePct: null,
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
    const uniquePct = uniqueMiddlePct(coords);

    // Out-and-back: unique road % < 15% is fatal (no meaningful loop section)
    if (uniquePct < 15) {
      fatalReasons.push(`OUT_AND_BACK: only ${uniquePct.toFixed(1)}% unique roads — pure out-and-back with no meaningful loop`);
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
      uniquePct,
    });

    // Print table row
    const nameTrunc = (route.name || '').slice(0, COL.name - 1).padEnd(COL.name);
    const disc = (route.discipline || '').padEnd(COL.disc);
    const dist = route.distance_km.toFixed(1).padEnd(COL.dist);
    const loopStr = loopGapKm !== null ? `${loopGapKm.toFixed(1)}km`.padEnd(COL.loop) : 'N/A'.padEnd(COL.loop);
    const uniqueStr = `${uniquePct.toFixed(1)}%`.padEnd(COL.unique);
    const statusStr = (status === 'approved' ? '✓ PASS' : '✗ FAIL').padEnd(COL.ok);
    const reasonShort = reason.slice(0, 80);
    console.log(`${nameTrunc} | ${disc} | ${dist} | ${loopStr} | ${uniqueStr} | ${statusStr} | ${reasonShort}`);
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
