#!/usr/bin/env node
/**
 * Build src/data/places-eu.json — the populated places the route generator
 * aims its loops at (villages and towns are on roads; the sea and the high
 * Pyrenees are not).
 *
 * Source: GeoNames (CC BY 4.0, https://www.geonames.org). Full per-country
 * files for the launch countries (villages included) + cities500 for the
 * rest of Europe.
 *
 *   node scripts/anchors/build-places.mjs <dir-with-geonames-txt-files>
 *
 * Expected files in the dir: IE.txt ES.txt PT.txt IT.txt FR.txt cities500.txt
 * (from download.geonames.org/export/dump/{IE,ES,PT,IT,FR,cities500}.zip).
 *
 * Output format: { v, source, built, n, p: [lat_e4, lng_e4, w, ...] }
 *   w = 0 village/hamlet, 1 town (pop ≥ 5 000), 2 city (pop ≥ 50 000)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2];
if (!dir) { console.error("usage: build-places.mjs <geonames-dir>"); process.exit(1); }

const FULL_COUNTRIES = ["IE", "ES", "PT", "IT", "FR"];
const EUROPE = { minLat: 34, maxLat: 62, minLng: -12, maxLng: 32 };
// The Canaries (Tenerife, Gran Canaria, Lanzarote are launch destinations)
// sit south-west of the Europe box.
const CANARIES = { minLat: 27.5, maxLat: 29.5, minLng: -18.5, maxLng: -13.3 };
const BOXES = [EUROPE, CANARIES];
const inBox = (lat, lng) => BOXES.some((b) => lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng);
// Not places a loop should aim at: sections of a place, abandoned/destroyed,
// religious/farm sub-features.
const SKIP_FCODES = new Set(["PPLX", "PPLQ", "PPLW", "PPLH", "PPLCH", "PPLF", "PPLR", "PPLS"]);

const seen = new Set();
const out = [];
let read = 0;

function ingest(file, onlyOutsideFull) {
  const path = join(dir, file);
  if (!existsSync(path)) { console.warn(`skip: ${file} not found`); return; }
  const lines = readFileSync(path, "utf8").split("\n");
  for (const line of lines) {
    if (!line) continue;
    const f = line.split("\t");
    read++;
    if (f[6] !== "P" || SKIP_FCODES.has(f[7])) continue;
    const cc = f[8];
    if (onlyOutsideFull && FULL_COUNTRIES.includes(cc)) continue;
    const lat = parseFloat(f[4]), lng = parseFloat(f[5]);
    if (!inBox(lat, lng)) continue;
    const latE4 = Math.round(lat * 1e4), lngE4 = Math.round(lng * 1e4);
    const key = `${Math.round(lat * 1e3)},${Math.round(lng * 1e3)}`; // ~100 m dedupe
    if (seen.has(key)) continue;
    seen.add(key);
    const pop = parseInt(f[14] || "0", 10) || 0;
    const w = pop >= 50000 ? 2 : pop >= 5000 ? 1 : 0;
    out.push(latE4, lngE4, w);
  }
}

for (const cc of FULL_COUNTRIES) ingest(`${cc}.txt`, false);
ingest("cities500.txt", true);

const n = out.length / 3;
const here = dirname(fileURLToPath(import.meta.url));
const dest = join(here, "..", "..", "src", "data", "places-eu.json");
mkdirSync(dirname(dest), { recursive: true });
const payload = {
  v: 1,
  source: "GeoNames (CC BY 4.0) — geonames.org",
  built: new Date().toISOString().slice(0, 10),
  n,
  p: out,
};
writeFileSync(dest, JSON.stringify(payload));
console.log(`read ${read} rows → ${n} places → ${dest} (${(JSON.stringify(payload).length / 1e6).toFixed(1)} MB)`);
