/**
 * Route Intent Parser
 *
 * Takes natural language cycling route requests and extracts a structured
 * RouteSpec using Claude. Geocodes place names via Nominatim.
 */

// Loaded dynamically to prevent Turbopack from bundling Node.js native modules
type AnthropicClient = InstanceType<typeof import("@anthropic-ai/sdk").default>;

export interface RouteSpec {
  distance_km: number;
  distance_tolerance_km: number;
  max_elevation_gain_m?: number;
  elevation_preference: "flat" | "rolling" | "hilly" | "mountainous" | "any";
  discipline: "road" | "gravel" | "mtb";
  start_point: [number, number]; // [lat, lng]
  end_point: [number, number];   // [lat, lng]
  is_loop: boolean;
  road_preferences: string[];    // OSM highway types: tertiary, unclassified, cycleway, etc
  avoid: string[];               // motorway, primary, urban, etc
  vibes: string[];               // scenic, coastal, quiet, forest, vineyard, etc
  region?: string;               // "Girona", "Dublin", etc
}

const SYSTEM_PROMPT = `You are a cycling route planning assistant with deep knowledge of OpenStreetMap (OSM) road classifications and cycling terrain.

When given a natural language route request, extract a structured JSON RouteSpec. Use your cycling domain knowledge:

## Road preferences by terrain description:
- "country lanes" / "quiet roads" / "back roads" → road_preferences: ["tertiary", "unclassified", "residential"]
- "bike paths" / "cycle paths" → road_preferences: ["cycleway", "path"]
- "forest tracks" / "gravel" / "off-road" → road_preferences: ["track", "unclassified", "path"]
- "coastal" → road_preferences: ["tertiary", "unclassified"] + vibes: ["coastal"]
- "main roads" / "fast roads" → road_preferences: ["secondary", "primary"]

## Things to avoid:
- "avoid busy roads" → avoid: ["primary", "secondary", "trunk", "motorway"]
- "avoid motorways" → avoid: ["motorway", "trunk"]
- "avoid urban" → avoid: ["residential", "service"] (often means prefer rural)
- Default: always include avoid: ["motorway", "trunk"] for cycling

## Elevation preferences:
- "flat" / "no climbing" / "easy" → elevation_preference: "flat", max_elevation_gain_m: distance_km * 5
- "minimum climbing" / "as flat as possible" → elevation_preference: "flat", max_elevation_gain_m: distance_km * 5
- "rolling" / "some hills" → elevation_preference: "rolling", max_elevation_gain_m: distance_km * 12
- "hilly" / "challenging" → elevation_preference: "hilly", max_elevation_gain_m: distance_km * 18
- "mountainous" / "epic climbing" → elevation_preference: "mountainous"
- not specified → elevation_preference: "any"

## Distance defaults:
- If no distance given, default to 50km
- distance_tolerance_km = max(5, distance_km * 0.1)

## Discipline defaults:
- "road bike" / "road cycling" → "road"
- "gravel" / "gravel bike" → "gravel"
- "mountain bike" / "MTB" / "trail" → "mtb"
- not specified → "road" (default)

## Loops:
- Most cycling routes are loops (start = end), so is_loop: true by default
- Only set is_loop: false if explicitly asked for a point-to-point route

## Vibes mapping:
- "scenic" → vibes: ["scenic"]
- "coastal" → vibes: ["coastal"]
- "vineyard" / "wine country" → vibes: ["vineyard"]
- "forest" / "woodland" → vibes: ["forest"]
- "quiet" / "peaceful" → vibes: ["quiet"]
- "village" → vibes: ["village"]

Return ONLY valid JSON matching this TypeScript interface (no markdown, no explanation):
{
  "distance_km": number,
  "distance_tolerance_km": number,
  "max_elevation_gain_m": number | null,
  "elevation_preference": "flat" | "rolling" | "hilly" | "mountainous" | "any",
  "discipline": "road" | "gravel" | "mtb",
  "start_point": null,
  "end_point": null,
  "is_loop": boolean,
  "road_preferences": string[],
  "avoid": string[],
  "vibes": string[],
  "region": string | null
}

Set start_point and end_point to null — they will be resolved by geocoding after you return.`;

async function geocodePlace(
  place: string
): Promise<[number, number] | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "loops.ie route generator" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || data.length === 0) return null;
  return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
}

export async function parseRouteIntent(prompt: string): Promise<RouteSpec> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client: AnthropicClient = new Anthropic();

  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  let parsed: Omit<RouteSpec, "start_point" | "end_point"> & {
    start_point: null;
    end_point: null;
    max_elevation_gain_m: number | null;
    region: string | null;
  };

  try {
    parsed = JSON.parse(text);
  } catch {
    // Try to extract JSON from response if wrapped in text
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Failed to parse LLM response as JSON: ${text}`);
    parsed = JSON.parse(match[0]);
  }

  // Geocode the region/start point
  let startPoint: [number, number] = [0, 0];
  if (parsed.region) {
    const coords = await geocodePlace(parsed.region);
    if (coords) startPoint = coords;
  }

  if (startPoint[0] === 0 && startPoint[1] === 0) {
    throw new Error(
      `Could not geocode location from prompt: "${prompt}". Please specify a clear starting location.`
    );
  }

  const spec: RouteSpec = {
    distance_km: parsed.distance_km,
    distance_tolerance_km: parsed.distance_tolerance_km,
    max_elevation_gain_m: parsed.max_elevation_gain_m ?? undefined,
    elevation_preference: parsed.elevation_preference,
    discipline: parsed.discipline,
    start_point: startPoint,
    end_point: startPoint, // loops return to start
    is_loop: parsed.is_loop,
    road_preferences: parsed.road_preferences,
    avoid: parsed.avoid,
    vibes: parsed.vibes,
    region: parsed.region ?? undefined,
  };

  return spec;
}
