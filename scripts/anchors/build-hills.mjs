/**
 * Named hills, peaks and passes for hill-repeat sessions: GeoNames country
 * dumps (CC BY 4.0, https://www.geonames.org) → src/data/hills.json.
 *
 *   node scripts/anchors/build-hills.mjs <dir with IE.txt GB.txt ES.txt PT.txt IT.txt FR.txt>
 *
 * Keeps feature class T (hill, mountain, peak, pass, ridge) with a height
 * (elevation, else GeoNames' SRTM "dem") of 40 m or more.
 * Row: [name, lat*1e4, lng*1e4, height_m, code].
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const COUNTRIES = ["IE", "GB", "ES", "PT", "IT", "FR"];
const CODES = new Set(["HLL", "HLLS", "MT", "MTS", "PK", "PKS", "PASS", "RDGE"]);
const MIN_M = 40;
const dir = process.argv[2];
if (!dir) { console.error("usage: build-hills.mjs <dir>"); process.exit(1); }

const rows = [];
for (const c of COUNTRIES) {
  for (const line of readFileSync(join(dir, `${c}.txt`), "utf8").split("\n")) {
    const f = line.split("\t");
    if (f.length < 17 || f[6] !== "T" || !CODES.has(f[7])) continue;
    const h = Number(f[15]) || Number(f[16]);
    if (!Number.isFinite(h) || h < MIN_M) continue;
    rows.push([f[1], Math.round(Number(f[4]) * 1e4), Math.round(Number(f[5]) * 1e4), Math.round(h), f[7]]);
  }
}
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "data", "hills.json");
writeFileSync(out, JSON.stringify({ v: 1, source: "GeoNames (CC BY 4.0) — geonames.org", minM: MIN_M, n: rows.length, p: rows }));
console.log(`${rows.length} hills → ${out}`);
