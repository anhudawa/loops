/**
 * Unified route importer — reads a hub manifest JSON and bulk-inserts
 * routes from public GPX URLs.
 *
 * Manifest format (JSON array):
 * [
 *   {
 *     "name": "Costa Brava Coastline",
 *     "gpx_url": "https://epicroadrides.com/...gpx",
 *     "description": "Classic loop...",
 *     "discipline": "road",
 *     "surface_type": "road",
 *     "county": "Girona",
 *     "country": "Spain",
 *     "region": "Cataluña",
 *     "operator_name": "Epic Road Rides",
 *     "operator_url": "https://epicroadrides.com"
 *   }
 * ]
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-routes.mjs scripts/hub-data/dublin.json
 *   node --env-file=.env.local scripts/import-routes.mjs scripts/hub-data/girona.json
 */

import { createPool } from "@vercel/postgres";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error("❌ POSTGRES_URL not set. Run with: node --env-file=.env.local scripts/import-routes.mjs <manifest.json>");
  process.exit(1);
}

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("❌ No manifest file specified. Usage: node scripts/import-routes.mjs <manifest.json>");
  process.exit(1);
}

const pool = createPool({ connectionString: POSTGRES_URL });

// ── GPX parsing (no xml2js dependency — regex-based like existing scripts) ──

function parseGpxText(text) {
  const points = [];
  const trkptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  const rteptRegex = /<rtept\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/rtept>/g;
  const wptRegex = /<wpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/wpt>/g;

  for (const regex of [trkptRegex, rteptRegex, wptRegex]) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      const eleMatch = match[3].match(/<ele>([^<]+)<\/ele>/);
      const ele = eleMatch ? parseFloat(eleMatch[1]) : 0;
      if (!isNaN(lat) && !isNaN(lng)) points.push({ lat, lng, ele });
    }
    if (points.length > 0) break; // prefer trkpt over rtept over wpt
  }
  return points;
}

// ── RideWithGPS JSON API ──

function isRwgpsUrl(url) {
  return /ridewithgps\.com\/(routes|trips)\/\d+/.test(url);
}

function rwgpsJsonUrl(url) {
  const match = url.match(/ridewithgps\.com\/(routes|trips)\/(\d+)/);
  if (!match) return null;
  return `https://ridewithgps.com/${match[1]}/${match[2]}.json`;
}

async function fetchRwgpsPoints(url) {
  const jsonUrl = rwgpsJsonUrl(url);
  if (!jsonUrl) throw new Error("Invalid RideWithGPS URL");
  const res = await fetch(jsonUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`RWGPS API returned ${res.status}`);
  const data = await res.json();
  const rte = data.route || data.trip || data;
  const tp = rte.track_points || [];
  return {
    points: tp.map((p) => ({ lat: p.y, lng: p.x, ele: p.e || 0 })),
    name: rte.name || null,
    distanceKm: rte.distance ? Math.round((rte.distance / 1000) * 10) / 10 : null,
    elevGain: rte.elevation_gain ? Math.round(rte.elevation_gain) : null,
    elevLoss: rte.elevation_loss ? Math.round(rte.elevation_loss) : null,
  };
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeStats(points) {
  let dist = 0, gain = 0, loss = 0;
  for (let i = 1; i < points.length; i++) {
    dist += haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    const d = points[i].ele - points[i - 1].ele;
    if (d > 0) gain += d; else loss += Math.abs(d);
  }
  return {
    distanceKm: Math.round(dist * 10) / 10,
    elevGain: Math.round(gain),
    elevLoss: Math.round(loss),
  };
}

function downsample(points, max = 8000) {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out = [points[0]];
  for (let i = 1; i < max - 1; i++) out.push(points[Math.round(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  console.log(`📦 Importing ${manifest.length} routes from ${manifestPath}\n`);

  let inserted = 0, skipped = 0, failed = 0;

  for (const route of manifest) {
    const label = route.name || route.gpx_url;
    process.stdout.write(`  ${label} … `);

    // Check for duplicate by name + county
    const { rows: existing } = await pool.query(
      `SELECT id FROM routes WHERE name = $1 AND county = $2 LIMIT 1`,
      [route.name, route.county]
    );
    if (existing.length > 0) {
      console.log("SKIP (already exists)");
      skipped++;
      continue;
    }

    let points;
    let precomputedStats = null;
    const sourceUrl = route.gpx_url || route.rwgps_url;
    if (!sourceUrl) {
      console.log("FAIL (no gpx_url or rwgps_url)");
      failed++;
      continue;
    }

    try {
      if (isRwgpsUrl(sourceUrl)) {
        const rwgps = await fetchRwgpsPoints(sourceUrl);
        points = rwgps.points;
        if (rwgps.distanceKm && rwgps.elevGain) {
          precomputedStats = {
            distanceKm: rwgps.distanceKm,
            elevGain: rwgps.elevGain,
            elevLoss: rwgps.elevLoss || rwgps.elevGain,
          };
        }
      } else {
        const res = await fetch(sourceUrl, {
          headers: { "User-Agent": "loops.ie route importer (https://www.loops.ie)" },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        points = parseGpxText(text);
      }
    } catch (err) {
      console.log(`FAIL (fetch: ${err.message})`);
      failed++;
      continue;
    }

    if (points.length < 5) {
      console.log(`FAIL (only ${points.length} points)`);
      failed++;
      continue;
    }

    const stats = precomputedStats || computeStats(points);
    const sampled = downsample(points);
    const coords = sampled.map((p) => [
      Math.round(p.lat * 1e6) / 1e6,
      Math.round(p.lng * 1e6) / 1e6,
      Math.round(p.ele * 10) / 10,
    ]);

    const id = randomUUID();
    try {
      await pool.query(
        `INSERT INTO routes (
          id, name, description, distance_km, elevation_gain_m, elevation_loss_m,
          surface_type, county, country, region, discipline,
          start_lat, start_lng, gpx_filename, coordinates,
          created_by, verified, quality_status, operator_name, operator_url
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15,
          $16, $17, $18, $19, $20
        )`,
        [
          id,
          route.name,
          route.description || null,
          stats.distanceKm,
          stats.elevGain,
          stats.elevLoss,
          route.surface_type || "road",
          route.county,
          route.country,
          route.region || route.county,
          route.discipline || "road",
          coords[0][0],
          coords[0][1],
          null,
          JSON.stringify(coords),
          null,
          true,
          "approved",
          route.operator_name || null,
          route.operator_url || null,
        ]
      );
      console.log(`OK (${stats.distanceKm} km, +${stats.elevGain}m, ${coords.length} pts)`);
      inserted++;
    } catch (err) {
      console.log(`FAIL (db: ${err.message})`);
      failed++;
    }
  }

  console.log(`\n✅ Done: ${inserted} inserted, ${skipped} skipped, ${failed} failed`);
}

main()
  .catch((e) => { console.error("Import failed:", e); process.exit(1); })
  .finally(() => pool.end());
