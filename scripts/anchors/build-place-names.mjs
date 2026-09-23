/**
 * Named towns for map labels (route-card thumbnails): GeoNames cities500
 * (CC BY 4.0, https://www.geonames.org) → src/data/place-names.json.
 *
 *   node scripts/anchors/build-place-names.mjs <path/to/cities500.txt>
 *
 * Keeps populated places of 500+ people in the countries LOOPS covers.
 * Row: [name, lat*1e4, lng*1e4, population].
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const COUNTRIES = new Set(["IE", "GB", "ES", "PT", "IT", "FR"]);
const MIN_POP = 500;
const src = process.argv[2];
if (!src) { console.error("usage: build-place-names.mjs <cities500.txt>"); process.exit(1); }

const rows = [];
for (const line of readFileSync(src, "utf8").split("\n")) {
  const f = line.split("\t");
  if (f.length < 15 || f[6] !== "P" || !COUNTRIES.has(f[8])) continue;
  const pop = Number(f[14]) || 0;
  if (pop < MIN_POP) continue;
  rows.push([f[1], Math.round(Number(f[4]) * 1e4), Math.round(Number(f[5]) * 1e4), pop]);
}
rows.sort((a, b) => b[3] - a[3]);
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "data", "place-names.json");
writeFileSync(out, JSON.stringify({ v: 1, source: "GeoNames cities500 (CC BY 4.0) — geonames.org", minPop: MIN_POP, n: rows.length, p: rows }));
console.log(`${rows.length} places → ${out}`);
