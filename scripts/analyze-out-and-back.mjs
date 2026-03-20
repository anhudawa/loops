#!/usr/bin/env node
/**
 * Analyze Girona GPX files for out-and-back overlap.
 * Splits each route into first half / second half by point count.
 * Reports what % of second-half points are within 200m of any first-half point.
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GPX_DIR = join(__dirname, "../src/data/girona-collection");

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseGpxPoints(xml) {
  const points = [];
  const re = /<trkpt\s[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    points.push({ lat: parseFloat(m[1]), lon: parseFloat(m[2]) });
  }
  return points;
}

function analyzeOutAndBack(points, thresholdM = 200) {
  const n = points.length;
  if (n < 10) return { overlapPct: 0, note: "too few points" };

  const mid = Math.floor(n / 2);
  const firstHalf = points.slice(0, mid);
  const secondHalf = points.slice(mid);

  // For efficiency, check every 5th second-half point against every 5th first-half point
  // (still ~200m resolution since dense GPX has points every few meters)
  const stride = Math.max(1, Math.floor(secondHalf.length / 200));
  const firstStride = Math.max(1, Math.floor(firstHalf.length / 200));

  const sampledSecond = secondHalf.filter((_, i) => i % stride === 0);
  const sampledFirst = firstHalf.filter((_, i) => i % firstStride === 0);

  let overlapping = 0;
  for (const sp of sampledSecond) {
    let nearEnough = false;
    for (const fp of sampledFirst) {
      if (haversineM(sp.lat, sp.lon, fp.lat, fp.lon) <= thresholdM) {
        nearEnough = true;
        break;
      }
    }
    if (nearEnough) overlapping++;
  }

  const pct = (overlapping / sampledSecond.length) * 100;
  return {
    totalPoints: n,
    firstHalfCount: firstHalf.length,
    secondHalfCount: secondHalf.length,
    sampledSecond: sampledSecond.length,
    sampledFirst: sampledFirst.length,
    overlapping,
    overlapPct: pct,
  };
}

const files = readdirSync(GPX_DIR)
  .filter((f) => f.endsWith(".gpx"))
  .sort();

console.log("\n=== Out-and-Back Analysis (200m threshold, 30% flag) ===\n");
console.log(
  `${"Route".padEnd(40)} ${"Points".padStart(6)} ${"Overlap%".padStart(9)} ${"Flag?"}`
);
console.log("─".repeat(70));

for (const file of files) {
  const xml = readFileSync(join(GPX_DIR, file), "utf8");
  const points = parseGpxPoints(xml);
  const result = analyzeOutAndBack(points);

  const name = file.replace(".gpx", "");
  const flag = result.overlapPct > 30 ? "⚠ OUT-AND-BACK" : "ok";
  console.log(
    `${name.padEnd(40)} ${String(result.totalPoints).padStart(6)} ${result.overlapPct.toFixed(1).padStart(8)}%  ${flag}`
  );
}

console.log("\n=== Detail for costa-brava-sant-grau ===\n");
const xml = readFileSync(join(GPX_DIR, "costa-brava-sant-grau.gpx"), "utf8");
const points = parseGpxPoints(xml);
const detail = analyzeOutAndBack(points);
console.log(JSON.stringify(detail, null, 2));
