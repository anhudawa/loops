#!/usr/bin/env node
// scripts/score-girona-routes.mjs
// Reads GPX files from src/data/girona-collection/, samples points,
// queries Overpass API for nearby road/way data, and outputs a quality report.

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../src/data/girona-collection');
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const SAMPLE_EVERY = 50;  // take every Nth track point
const RADIUS_M = 30;       // metres radius around each sampled point

// Highway types that are cycling-friendly
const CYCLING_FRIENDLY = new Set([
  'cycleway', 'path', 'living_street', 'residential', 'unclassified',
  'tertiary', 'tertiary_link', 'secondary', 'secondary_link',
  'track', 'service',
]);

// Highway types that indicate high-speed / hostile roads
const HIGH_SPEED_HIGHWAY = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link']);

// Surface tags considered good for cycling
const GOOD_SURFACE = new Set([
  'asphalt', 'paved', 'concrete', 'concrete:plates', 'concrete:lanes',
  'cobblestone', 'sett', 'paving_stones',
  'compacted', 'fine_gravel', 'gravel',
]);

// ── GPX parsing ──────────────────────────────────────────────────────────────

function parseGpx(content) {
  const points = [];
  // Match both attribute orderings: lat/lon and lon/lat
  const re = /<trkpt\b[^>]*\blat="([^"]+)"[^>]*\blon="([^"]+)"/g;
  const re2 = /<trkpt\b[^>]*\blon="([^"]+)"[^>]*\blat="([^"]+)"/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    points.push({ lat: parseFloat(m[1]), lon: parseFloat(m[2]) });
  }
  if (points.length === 0) {
    while ((m = re2.exec(content)) !== null) {
      points.push({ lat: parseFloat(m[2]), lon: parseFloat(m[1]) });
    }
  }
  return points;
}

function samplePoints(points, every) {
  const out = [];
  for (let i = 0; i < points.length; i += every) out.push(points[i]);
  return out;
}

// ── Overpass API ─────────────────────────────────────────────────────────────

async function queryOverpass(sampledPoints) {
  const parts = sampledPoints
    .map(p => `way(around:${RADIUS_M},${p.lat},${p.lon})[highway];`)
    .join('\n  ');
  const query = `[out:json][timeout:60];\n(\n  ${parts}\n);\nout tags;`;

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) throw new Error(`Overpass ${res.status}: ${res.statusText}`);
  return res.json();
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreFromOverpass(data) {
  const ways = (data.elements || []).filter(e => e.type === 'way');

  if (ways.length === 0) {
    return { cyclingFriendlyPct: 0, goodSurfacePct: 0, highSpeedPct: 0, score: 50, wayCount: 0 };
  }

  let cyclingFriendly = 0, goodSurface = 0, highSpeed = 0;

  for (const way of ways) {
    const tags = way.tags || {};
    const highway = tags.highway || '';
    const surface = tags.surface || '';
    const maxspeed = parseInt(tags.maxspeed) || 0;

    if (CYCLING_FRIENDLY.has(highway)) cyclingFriendly++;
    if (HIGH_SPEED_HIGHWAY.has(highway) || maxspeed > 80) highSpeed++;
    if (GOOD_SURFACE.has(surface)) goodSurface++;
  }

  const n = ways.length;
  const cyclingFriendlyPct = Math.round((cyclingFriendly / n) * 100);
  const goodSurfacePct = Math.round((goodSurface / n) * 100);
  const highSpeedPct = Math.round((highSpeed / n) * 100);

  // Score: baseline 50, reward cycling-friendly & good surface, penalise high-speed
  const score = Math.max(0, Math.min(100,
    50 + (cyclingFriendlyPct * 0.3) + (goodSurfacePct * 0.1) - (highSpeedPct * 0.5)
  ));

  return { cyclingFriendlyPct, goodSurfacePct, highSpeedPct, score: Math.round(score), wayCount: n };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatName(filename) {
  return filename
    .replace('.gpx', '')
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.gpx')).sort();
  console.log(`Found ${files.length} GPX files in src/data/girona-collection/\n`);

  const results = [];

  for (const file of files) {
    const name = formatName(file);
    process.stdout.write(`Scoring: ${name.padEnd(36)}`);

    try {
      const content = readFileSync(join(DATA_DIR, file), 'utf8');
      const points = parseGpx(content);

      if (points.length === 0) {
        console.log('SKIP — no track points found');
        results.push({ name, error: 'no track points' });
        continue;
      }

      const sampled = samplePoints(points, SAMPLE_EVERY);
      process.stdout.write(`${String(points.length).padStart(5)} pts → ${String(sampled.length).padStart(3)} sampled  `);

      const data = await queryOverpass(sampled);
      const scores = scoreFromOverpass(data);

      console.log(`score=${String(scores.score).padStart(3)}  (${scores.wayCount} ways)`);
      results.push({ name, points: points.length, sampled: sampled.length, ...scores });

      await sleep(1500); // be polite to Overpass
    } catch (err) {
      console.log(`ERROR — ${err.message}`);
      results.push({ name, error: err.message });
      await sleep(2000);
    }
  }

  // ── Report table ─────────────────────────────────────────────────────────
  const W = 90;
  console.log('\n' + '═'.repeat(W));
  console.log('  GIRONA ROUTES — QUALITY SCORE REPORT');
  console.log('═'.repeat(W));
  console.log(
    '  Route'.padEnd(38) +
    'Score'.padStart(6) +
    'CycleRd%'.padStart(10) +
    'Surface%'.padStart(10) +
    'HiSpd%'.padStart(8) +
    'Ways'.padStart(6) +
    '  Rating'
  );
  console.log('  ' + '─'.repeat(W - 2));

  // Sort by score descending
  const sorted = [...results].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  for (const r of sorted) {
    if (r.error) {
      console.log('  ' + r.name.padEnd(36) + '  ERROR: ' + r.error);
    } else {
      const stars = r.score >= 80 ? '★★★★★'
        : r.score >= 70 ? '★★★★☆'
        : r.score >= 60 ? '★★★☆☆'
        : r.score >= 50 ? '★★☆☆☆'
        : '★☆☆☆☆';
      console.log(
        '  ' + r.name.padEnd(36) +
        String(r.score).padStart(6) +
        String(r.cyclingFriendlyPct + '%').padStart(10) +
        String(r.goodSurfacePct + '%').padStart(10) +
        String(r.highSpeedPct + '%').padStart(8) +
        String(r.wayCount).padStart(6) +
        '  ' + stars
      );
    }
  }

  console.log('═'.repeat(W));
  console.log(`
Methodology:
  Cycling-friendly roads : cycleway, path, residential, tertiary, secondary, unclassified, track, service
  Good surface           : asphalt, paved, concrete, compacted, fine_gravel, gravel, cobblestone
  High-speed roads       : motorway, trunk (any link variants), or maxspeed > 80 km/h
  Score formula          : 50 + (cycle% × 0.3) + (surface% × 0.1) − (hi-speed% × 0.5)  [capped 0–100]

  Ways are all highway=* ways within ${RADIUS_M}m of any sampled point (one sample per ${SAMPLE_EVERY} track points).
  Score reflects road-type mix near the route — not strict per-point attribution.
`);
}

main().catch(e => { console.error(e); process.exit(1); });
