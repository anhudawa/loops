/**
 * Known start places — resolved locally, with no external lookup.
 *
 * Every launch destination plus the home-turf towns riders type most. A
 * place in this table can never be mis-geocoded to the wrong country (the
 * failure that once planned a "Girona" loop from the middle of Tipperary).
 * Coordinates are town-centre points on the road network.
 */

export interface KnownPlace {
  /** Canonical display name. */
  name: string;
  /** Country name as the intent parser uses it. */
  country: string;
  point: [number, number]; // [lat, lng]
  /** Alternative spellings / sub-places that should resolve here. */
  aliases?: string[];
}

export const KNOWN_PLACES: KnownPlace[] = [
  // ── Launch destinations ────────────────────────────────────────────────
  { name: "Girona", country: "Spain", point: [41.9794, 2.8214], aliases: ["gerona"] },
  { name: "Palma", country: "Spain", point: [39.5696, 2.6502], aliases: ["mallorca", "majorca", "palma de mallorca"] },
  { name: "Port de Pollença", country: "Spain", point: [39.9077, 3.0813], aliases: ["port de pollenca", "port de pollensa", "puerto pollensa", "puerto de pollensa", "pollenca", "pollença"] },
  { name: "Alcúdia", country: "Spain", point: [39.8523, 3.1213], aliases: ["alcudia", "port d'alcudia", "port d'alcúdia"] },
  { name: "Sóller", country: "Spain", point: [39.7657, 2.7147], aliases: ["soller", "port de soller", "port de sóller"] },
  { name: "Málaga", country: "Spain", point: [36.7213, -4.4214], aliases: ["malaga"] },
  { name: "Calpe", country: "Spain", point: [38.6447, 0.0453], aliases: ["calp"] },
  { name: "Altea", country: "Spain", point: [38.5989, -0.0517] },
  { name: "Dénia", country: "Spain", point: [38.8408, 0.1057], aliases: ["denia"] },
  { name: "Puerto de la Cruz", country: "Spain", point: [28.4142, -16.5448], aliases: ["tenerife"] },
  { name: "Maspalomas", country: "Spain", point: [27.7606, -15.5860], aliases: ["gran canaria", "playa del ingles", "playa del inglés"] },
  { name: "Puerto del Carmen", country: "Spain", point: [28.9214, -13.6630], aliases: ["lanzarote"] },
  { name: "Faro", country: "Portugal", point: [37.0194, -7.9322], aliases: ["algarve"] },
  { name: "Lagos", country: "Portugal", point: [37.1028, -8.6728] },
  { name: "Lucca", country: "Italy", point: [43.8429, 10.5027] },
  { name: "Nice", country: "France", point: [43.7102, 7.2620] },
  // ── Home turf ──────────────────────────────────────────────────────────
  { name: "Dublin", country: "Ireland", point: [53.3498, -6.2603] },
  { name: "Wicklow", country: "Ireland", point: [52.9808, -6.0446], aliases: ["wicklow town"] },
  { name: "Bray", country: "Ireland", point: [53.2026, -6.0983] },
  { name: "Enniskerry", country: "Ireland", point: [53.1930, -6.1700] },
  { name: "Blessington", country: "Ireland", point: [53.1702, -6.5327] },
  { name: "Skerries", country: "Ireland", point: [53.5799, -6.1078] },
  { name: "Malahide", country: "Ireland", point: [53.4509, -6.1544] },
  { name: "Howth", country: "Ireland", point: [53.3871, -6.0656] },
  { name: "Clontarf", country: "Ireland", point: [53.3636, -6.2003] },
  { name: "Dún Laoghaire", country: "Ireland", point: [53.2940, -6.1340], aliases: ["dun laoghaire", "dunlaoghaire"] },
  { name: "Greystones", country: "Ireland", point: [53.1440, -6.0630] },
  { name: "Naas", country: "Ireland", point: [53.2158, -6.6669] },
  { name: "Cork", country: "Ireland", point: [51.8985, -8.4756] },
  { name: "Galway", country: "Ireland", point: [53.2707, -9.0568] },
  { name: "Limerick", country: "Ireland", point: [52.6638, -8.6267] },
  { name: "Kilkenny", country: "Ireland", point: [52.6541, -7.2448] },
  { name: "Belfast", country: "United Kingdom", point: [54.5973, -5.9301] },
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a typed place ("Girona", "port de pollensa, mallorca", "Calp") to
 * a known start. Matches the whole string, then its comma-separated parts,
 * so "Calpe, Spain" and "Port de Pollença, Mallorca" both resolve to the
 * most specific known place.
 */
export function lookupKnownPlace(place: string): KnownPlace | null {
  const q = norm(place);
  if (!q) return null;
  const index = knownIndex();
  const direct = index.get(q);
  if (direct) return direct;
  for (const part of q.split(",").map((p) => p.trim()).filter(Boolean)) {
    const hit = index.get(part);
    if (hit) return hit;
  }
  // Prefix forms: "Girona city", "Girona old town".
  for (const [key, hit] of index) {
    if (q.startsWith(key + " ") && key.length >= 4) return hit;
  }
  return null;
}

let cachedIndex: Map<string, KnownPlace> | null = null;
function knownIndex(): Map<string, KnownPlace> {
  if (cachedIndex) return cachedIndex;
  const m = new Map<string, KnownPlace>();
  for (const p of KNOWN_PLACES) {
    m.set(norm(p.name), p);
    for (const a of p.aliases ?? []) m.set(norm(a), p);
  }
  cachedIndex = m;
  return m;
}
