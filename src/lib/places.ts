/**
 * Populated places (villages, towns, cities) for route planning — bundled,
 * so candidate loops can be aimed at real places with no external lookup.
 *
 * Data: src/data/places-eu.json, built by scripts/anchors/build-places.mjs
 * from GeoNames (CC BY 4.0). ~250k places across Europe; full village lists
 * for Ireland, Spain, Portugal, Italy and France.
 *
 * Villages and small towns are what a loop should aim at: they are on the
 * road network (unlike a geometric point that lands in the sea or on a
 * mountainside), and they are where the quiet roads meet. Cities are kept
 * for support ranking but weighted down as far points — traffic.
 */

import placesData from "@/data/places-eu.json";

export interface Place {
  lat: number;
  lng: number;
  /** 0 village/hamlet · 1 town · 2 city */
  weight: 0 | 1 | 2;
}

const CELL_DEG = 0.1; // ~11 km × ~7 km cells at Irish latitudes

interface PlaceIndex {
  cells: Map<string, number[]>; // cell key → indices into the flat array
  flat: number[];
}

let index: PlaceIndex | null = null;

function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lat / CELL_DEG)}:${Math.floor(lng / CELL_DEG)}`;
}

function buildIndex(): PlaceIndex {
  if (index) return index;
  const flat = (placesData as { p: number[] }).p;
  const cells = new Map<string, number[]>();
  for (let i = 0; i < flat.length; i += 3) {
    const key = cellKey(flat[i] / 1e4, flat[i + 1] / 1e4);
    let bucket = cells.get(key);
    if (!bucket) { bucket = []; cells.set(key, bucket); }
    bucket.push(i);
  }
  index = { cells, flat };
  return index;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Every bundled place within `radiusKm` of a point. */
export function nearbyPlaces(lat: number, lng: number, radiusKm: number): Place[] {
  const idx = buildIndex();
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const out: Place[] = [];
  const cLat0 = Math.floor((lat - dLat) / CELL_DEG), cLat1 = Math.floor((lat + dLat) / CELL_DEG);
  const cLng0 = Math.floor((lng - dLng) / CELL_DEG), cLng1 = Math.floor((lng + dLng) / CELL_DEG);
  for (let a = cLat0; a <= cLat1; a++) {
    for (let b = cLng0; b <= cLng1; b++) {
      const bucket = idx.cells.get(`${a}:${b}`);
      if (!bucket) continue;
      for (const i of bucket) {
        const pLat = idx.flat[i] / 1e4, pLng = idx.flat[i + 1] / 1e4;
        if (haversineKm(lat, lng, pLat, pLng) <= radiusKm) {
          out.push({ lat: pLat, lng: pLng, weight: idx.flat[i + 2] as 0 | 1 | 2 });
        }
      }
    }
  }
  return out;
}

/** Number of bundled places (diagnostics). */
export function placeCount(): number {
  return (placesData as { n: number }).n;
}
