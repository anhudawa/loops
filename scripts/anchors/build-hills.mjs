/**
 * Named hills, peaks and passes for hill-repeat sessions: GeoNames country
 * dumps (CC BY 4.0, https://www.geonames.org) → src/data/hills.json.
 *
 *   node scripts/anchors/build-hills.mjs <dir with IE.txt GB.txt ES.txt PT.txt IT.txt FR.txt> [osm-dir]
 *
 * Optional osm-dir: Overpass JSON files (named natural=peak|saddle|hill and
 * mountain_pass=yes nodes, one file per region — GeoNames is thin in places
 * like Mallorca). OSM © OpenStreetMap contributors (ODbL). Kept when they
 * carry an `ele` and are not within 300 m of a GeoNames feature.
 *
 * Keeps feature class T (hill, mountain, peak, pass, ridge) with a height
 * (elevation, else GeoNames' SRTM "dem") of 40 m or more.
 * Row: [name, lat*1e4, lng*1e4, height_m, code].
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
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
const osmDir = process.argv[3];
if (osmDir) {
  const near = (a, b) => Math.abs(a[1] - b[1]) < 30 && Math.abs(a[2] - b[2]) < 40; // ~300 m in 1e-4 degrees
  const index = new Map();
  const key = (lat, lng) => `${Math.round(lat / 100)}:${Math.round(lng / 100)}`;
  for (const r of rows) (index.get(key(r[1], r[2])) ?? index.set(key(r[1], r[2]), []).get(key(r[1], r[2]))).push(r);
  let added = 0;
  for (const f of readdirSync(osmDir).filter((n) => n.endsWith(".json"))) {
    let els = [];
    try { els = JSON.parse(readFileSync(join(osmDir, f), "utf8")).elements ?? []; } catch { continue; }
    for (const e of els) {
      const t = e.tags ?? {};
      const h = parseFloat(String(t.ele ?? "").replace(",", "."));
      if (!t.name || !Number.isFinite(h) || h < MIN_M) continue;
      const code = t.mountain_pass === "yes" ? "PASS" : t.natural === "saddle" ? "SDL" : t.natural === "hill" ? "HLL" : "PK";
      const row = [t.name, Math.round(e.lat * 1e4), Math.round(e.lon * 1e4), Math.round(h), code];
      const dup = (index.get(key(row[1], row[2])) ?? []).some((r) => near(r, row));
      if (dup) continue;
      rows.push(row);
      (index.get(key(row[1], row[2])) ?? index.set(key(row[1], row[2]), []).get(key(row[1], row[2]))).push(row);
      added++;
    }
  }
  console.log(`+${added} from OpenStreetMap`);
}
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "data", "hills.json");
writeFileSync(out, JSON.stringify({ v: 1, source: osmDir ? "GeoNames (CC BY 4.0) — geonames.org; OpenStreetMap contributors (ODbL)" : "GeoNames (CC BY 4.0) — geonames.org", minM: MIN_M, n: rows.length, p: rows }));
console.log(`${rows.length} hills → ${out}`);
