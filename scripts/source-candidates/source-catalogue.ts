import { readFile } from "node:fs/promises";
import {
  parseCurroBikes,
  parseBikePointTenerife,
  parseCyclingCalpe,
  parseCyclingIreland,
  parseLanzaroteBike,
  parseMallorcaCyclingCenter,
  parseMallorcaVelo,
  parseSportIreland,
  parseTuscanyTrail365,
  parseWebTenerife,
  type SourceCandidateInput,
} from "./source-parsers";
import { expandedCuratedCandidates } from "./expanded-curated-sources";

const LIVE_SOURCES = [
  ["Cycling Ireland", "https://www.cyclingireland.ie/key-documents/find-a-route/", parseCyclingIreland],
  ["Sport Ireland Outdoors", "https://www.sportireland.ie/outdoors/cycling-on-road/trails", parseSportIreland],
  ["MallorcaVelo", "https://mallorcavelo.com/routes/", parseMallorcaVelo],
  ["CurroBikes", "https://currobikes.es/rutas", parseCurroBikes],
  ["Mallorca Cycling Center", "https://www.mallorcacyclingcenter.com/routes/", parseMallorcaCyclingCenter],
  ["Bike Point Tenerife", "https://bikepointtenerife.com/download-gps-bike-routes-in-tenerife/", parseBikePointTenerife],
  ["Cycling Calpe", "https://www.cyclingcalpe.eu/", parseCyclingCalpe],
  ["Lanzarote Bike", "https://en.lanzarotebike.com/routes", parseLanzaroteBike],
  ["Tuscany Trail 365", "https://cyclingintuscany.tuscanytrail.it/itinerari/", parseTuscanyTrail365],
  ["Tenerife Tourism", "https://www.webtenerife.co.uk/what-to-do/routes/cycling/", parseWebTenerife],
] as const;

type HubRoute = {
  name: string;
  rwgps_url?: string;
  discipline?: string;
  distance_km?: number;
  elevation_gain_m?: number;
  county?: string;
  country?: string;
  region?: string;
  operator_name?: string;
  operator_url?: string;
};

const HUB_FILES = [
  {
    url: new URL("../hub-data/girona-eat-sleep-cycle.json", import.meta.url),
    sourceName: "Eat Sleep Cycle",
    sourcePageUrl: "https://www.eatsleepcycle.com/girona-cycling-routes/",
    destination: "Girona" as const,
    rolloutPhase: 2 as const,
  },
  {
    url: new URL("../hub-data/girona.json", import.meta.url),
    sourceName: "Epic Road Rides",
    sourcePageUrl: "https://epicroadrides.com/cycling-spain/girona-costa-brava/",
    destination: "Girona" as const,
    rolloutPhase: 2 as const,
  },
  {
    url: new URL("../hub-data/mallorca-epic-road-rides.json", import.meta.url),
    sourceName: "Epic Road Rides",
    sourcePageUrl: "https://epicroadrides.com/cycling-spain/mallorca/",
    destination: "Mallorca" as const,
    rolloutPhase: 3 as const,
  },
] as const;

function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function hubCandidates(): Promise<SourceCandidateInput[]> {
  const output: SourceCandidateInput[] = [];
  for (const source of HUB_FILES) {
    const routes = JSON.parse(await readFile(source.url, "utf8")) as HubRoute[];
    for (const route of routes.filter((item) => item.discipline === "road")) {
      const key = `${slug(source.sourceName)}:${source.destination.toLowerCase()}:${slug(route.name)}`;
      output.push({
        sourceKey: key,
        rolloutPhase: source.rolloutPhase,
        destination: source.destination,
        sourceName: source.sourceName,
        sourcePageUrl: source.sourcePageUrl,
        sourceTrackUrl: route.rwgps_url || null,
        sourceExternalId: route.rwgps_url?.match(/\/(\d+)\/?$/)?.[1] || slug(route.name),
        routeName: route.name,
        country: route.country || "Spain",
        region: route.region || (source.destination === "Mallorca" ? "Balearic Islands" : "Catalonia"),
        county: route.county || source.destination,
        discipline: "road",
        routeFormat: /\bloop\b/i.test(route.name) ? "loop" : "unknown",
        distanceKm: route.distance_km || null,
        elevationGainM: route.elevation_gain_m || null,
        sourceEvidence: "publisher_route_library_with_public_track",
        sourceClaimsRecorded: false,
        sourceValidationStatus: "locally_curated",
        sourceValidationBasis: "Destination cycling publisher or local operator route page and public track reference checked.",
        acquisitionTarget: `${source.sourceName} author, guide or named local rider`,
        nextAction: "Identify the person who rode this exact version, then collect their personal timestamped export and publication consent.",
      });
    }
  }
  return output;
}

export async function buildSourceCatalogue(): Promise<SourceCandidateInput[]> {
  const fetched = await Promise.all(LIVE_SOURCES.map(async ([name, url, parser]) => {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/139 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
    const candidates = parser(await response.text());
    if (candidates.length === 0) throw new Error(`${name} returned no parseable route candidates`);
    return candidates;
  }));
  const combined = [...fetched.flat(), ...await hubCandidates(), ...expandedCuratedCandidates];
  const byKey = new Map(combined.map((candidate) => [candidate.sourceKey, candidate]));
  return [...byKey.values()].sort((a, b) => a.rolloutPhase - b.rolloutPhase || a.sourceName.localeCompare(b.sourceName) || a.routeName.localeCompare(b.routeName));
}
