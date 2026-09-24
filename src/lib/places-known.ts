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
  { name: "Port de Pollença", country: "Spain", point: [39.9077, 3.0813], aliases: ["port de pollenca", "port de pollensa", "puerto pollensa", "puerto de pollensa", "puerto de pollenca"] },
  // The town is 6 km inland from its port: a different start.
  { name: "Pollença", country: "Spain", point: [39.8768, 3.0163], aliases: ["pollenca", "pollensa", "pollensa town", "pollenca town"] },
  { name: "Alcúdia", country: "Spain", point: [39.8523, 3.1213], aliases: ["alcudia", "port d'alcudia", "port d'alcúdia"] },
  // Ride-to destinations (road-end points): capes and climbs with one road in.
  { name: "Cap de Formentor", country: "Spain", point: [39.9612, 3.2127], aliases: ["formentor", "cape formentor", "cap formentor", "formentor lighthouse", "far de formentor", "formentor lighthouse mallorca"] },
  { name: "Sa Calobra", country: "Spain", point: [39.8506, 2.7969], aliases: ["calobra", "la calobra"] },
  { name: "Sóller", country: "Spain", point: [39.7657, 2.7147], aliases: ["soller"] },
  { name: "Port de Sóller", country: "Spain", point: [39.7970, 2.6962], aliases: ["port de soller", "puerto de soller", "puerto soller"] },
  { name: "Deià", country: "Spain", point: [39.7481, 2.6482], aliases: ["deia", "deya"] },
  // Mallorca's high road: the Ma-10 top by the Puig Major tunnel (the summit is military).
  { name: "Puig Major", country: "Spain", point: [39.7883, 2.7784], aliases: ["coll de puig major"] },
  // Girona's climbs.
  { name: "Rocacorba", country: "Spain", point: [42.0728, 2.6857], aliases: ["puig de rocacorba"] },
  { name: "Els Àngels", country: "Spain", point: [41.9847, 2.9089], aliases: ["els angels", "santuari dels angels", "mare de deu dels angels"] },
  { name: "Málaga", country: "Spain", point: [36.7213, -4.4214], aliases: ["malaga"] },
  { name: "Calpe", country: "Spain", point: [38.6447, 0.0453], aliases: ["calp"] },
  { name: "Altea", country: "Spain", point: [38.5989, -0.0517] },
  { name: "Dénia", country: "Spain", point: [38.8408, 0.1057], aliases: ["denia"] },
  { name: "Coll de Rates", country: "Spain", point: [38.7236, -0.0595], aliases: ["col de rates"] },
  { name: "Puerto de la Cruz", country: "Spain", point: [28.4142, -16.5448], aliases: ["tenerife"] },
  // Teide: the TF-21 by the cable-car station (2 350 m), where the road tops out.
  { name: "Teide", country: "Spain", point: [28.2546, -16.6260], aliases: ["el teide", "mount teide", "mt teide", "pico del teide", "teide national park", "las canadas"] },
  { name: "La Orotava", country: "Spain", point: [28.3908, -16.5231], aliases: ["orotava"] },
  { name: "Vilaflor", country: "Spain", point: [28.1562, -16.6359] },
  { name: "Masca", country: "Spain", point: [28.3040, -16.8424] },
  { name: "Maspalomas", country: "Spain", point: [27.7606, -15.5860], aliases: ["gran canaria", "playa del ingles", "playa del inglés"] },
  { name: "Tejeda", country: "Spain", point: [27.9951, -15.6154] },
  { name: "Ayacata", country: "Spain", point: [27.9583, -15.6082] },
  // Not the Castilian city: the Gran Canaria village by the Soria dam.
  { name: "Soria (Gran Canaria)", country: "Spain", point: [27.9066, -15.6694], aliases: ["soria gran canaria", "presa de soria"] },
  { name: "Fataga", country: "Spain", point: [27.8872, -15.5638] },
  { name: "San Bartolomé de Tirajana", country: "Spain", point: [27.9248, -15.5733], aliases: ["san bartolome", "tunte"] },
  { name: "Vega de San Mateo", country: "Spain", point: [28.0089, -15.5333] },
  { name: "Pico de las Nieves", country: "Spain", point: [27.9628, -15.5712], aliases: ["pozo de las nieves"] },
  { name: "Puerto del Carmen", country: "Spain", point: [28.9214, -13.6630], aliases: ["lanzarote"] },
  { name: "Teguise", country: "Spain", point: [29.0605, -13.5640] },
  { name: "Haría", country: "Spain", point: [29.1455, -13.4999] },
  { name: "Yaiza", country: "Spain", point: [28.9568, -13.7653] },
  { name: "Tinajo", country: "Spain", point: [29.0633, -13.6765] },
  { name: "Mirador del Río", country: "Spain", point: [29.2130, -13.4810] },
  { name: "Faro", country: "Portugal", point: [37.0194, -7.9322], aliases: ["algarve"] },
  { name: "Lagos", country: "Portugal", point: [37.1028, -8.6728] },
  { name: "Fóia", country: "Portugal", point: [37.3160, -8.5929], aliases: ["monte foia"] },
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
  { name: "Rathfarnham", country: "Ireland", point: [53.3006, -6.2828] },
  { name: "Kinsale", country: "Ireland", point: [51.7075, -8.5306] },
  // The Wicklow Mountains: villages and the climbs riders name.
  { name: "Laragh", country: "Ireland", point: [53.009, -6.298] },
  { name: "Glendalough", country: "Ireland", point: [53.0117, -6.3274] },
  { name: "Roundwood", country: "Ireland", point: [53.0586, -6.2261] },
  { name: "Sally Gap", country: "Ireland", point: [53.136, -6.313] },
  { name: "Wicklow Gap", country: "Ireland", point: [53.0397, -6.4005] },
  { name: "Killakee", country: "Ireland", point: [53.2541, -6.3094] },
  { name: "Glencree", country: "Ireland", point: [53.1937, -6.3004] },
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
 * a known start. Matches the name before any comma, so "Calpe, Spain" and
 * "Port de Pollença, Mallorca" both resolve to the most specific known
 * place; then prefix forms; then a misspelling ("soler" → Sóller).
 */
export function lookupKnownPlace(place: string): KnownPlace | null {
  // "Laragh, Co. Wicklow": the place is before the comma — the qualifier
  // only says which one ("Kilmacanogue, Wicklow" is not Wicklow town).
  const q = norm(place.split(",")[0] ?? "");
  if (!q) return null;
  const index = knownIndex();
  const direct = index.get(q) ?? index.get(norm(place));
  if (direct) return direct;
  // Prefix forms: "Girona city", "Girona old town".
  for (const [key, hit] of index) {
    if (q.startsWith(key + " ") && key.length >= 4) return hit;
  }
  return fuzzyKnownPlace(q);
}

/**
 * How many typos a name may carry and still be ours: none under 5 letters
 * ("Alte" is an Algarve village, not Altea), one up to 7 ("soler" → Sóller,
 * but "Galdar" is not Galway), two from 8 ("pollensa town").
 */
function typoBudget(len: number): number {
  return len < 5 ? 0 : len < 8 ? 1 : 2;
}

/** Levenshtein distance, stopping early once it passes `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * A misspelt known place — "soler" is Sóller, "deia" Deià, "pollensa"
 * Pollença — matched before any geocoder sees it (which sent "soler" to
 * Chile and "Deia" to Romania). Same first letter, within the typo budget,
 * and one clear winner; a tie between two places is no match.
 */
function fuzzyKnownPlace(q: string): KnownPlace | null {
  const budget = typoBudget(q.length);
  if (budget === 0) return null;
  let best: KnownPlace | null = null, bestD = budget + 1, tie = false;
  for (const [key, hit] of knownIndex()) {
    if (key[0] !== q[0]) continue;
    const d = editDistance(q, key, Math.min(budget, typoBudget(key.length)));
    if (d > Math.min(budget, typoBudget(key.length))) continue;
    if (d < bestD) { best = hit; bestD = d; tie = false; }
    else if (d === bestD && best !== hit) tie = true;
  }
  return tie ? null : best;
}

/** The known place nearest a point, within `maxKm` (the country a phone's location is in). */
export function nearestKnownPlace(point: [number, number], maxKm: number): KnownPlace | null {
  let best: KnownPlace | null = null, bd = maxKm;
  for (const k of KNOWN_PLACES) {
    const dy = (k.point[0] - point[0]) * 111.32;
    const dx = (k.point[1] - point[1]) * 111.32 * Math.cos((point[0] * Math.PI) / 180);
    const d = Math.hypot(dx, dy);
    if (d <= bd) { bd = d; best = k; }
  }
  return best;
}

/**
 * How a place shows back to the rider: a known place by its own name
 * ("calpe" → "Calpe", "soler" → "Sóller"); an alias they typed ("playa del
 * ingles") and anything we do not know stay in their words.
 */
export function displayPlaceName(typed: string): string {
  const known = lookupKnownPlace(typed);
  const first = typed.split(",")[0].trim();
  if (!known) return typed;
  const q = norm(first);
  const alias = q !== norm(known.name) && (known.aliases ?? []).some((a) => norm(a) === q);
  return alias ? first : known.name;
}

/** Place names that are also everyday words: only a capitalised mention counts ("Nice", not "a nice ride"). */
const EVERYDAY_WORDS = new Set(["nice"]);

/**
 * The first known place named anywhere in free text — "malaga hills 70 km",
 * "Girona 100km hilly" — longest name first, exact names and aliases only
 * (no typo matching inside a sentence: too many ordinary words are one
 * letter off a town).
 */
export function findKnownPlaceIn(text: string): { place: KnownPlace; text: string } | null {
  const words = text.replace(/[–—]/g, " ").split(/[\s,;:!?()]+/).filter(Boolean);
  const index = knownIndex();
  let found: { place: KnownPlace; text: string; at: number; n: number } | null = null;
  for (let i = 0; i < words.length; i++) {
    for (let n = Math.min(5, words.length - i); n >= 1; n--) {
      const raw = words.slice(i, i + n).join(" ").replace(/[.'’]+$/, "");
      const key = norm(raw);
      const hit = index.get(key);
      if (!hit) continue;
      if (EVERYDAY_WORDS.has(key) && !/^[A-ZÀ-Ý]/.test(raw)) continue;
      // "the Dublin mountains" is a range, not the city ("malaga hills" is Málaga).
      if (/^the$/i.test(words[i - 1] ?? "") && /^(?:mountains|hills)$/i.test(words[i + n] ?? "")) continue;
      if (!found) found = { place: hit, text: raw, at: i, n };
      break;
    }
    if (found) break;
  }
  return found ? { place: found.place, text: found.text } : null;
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
