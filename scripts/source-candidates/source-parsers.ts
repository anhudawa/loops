export interface SourceCandidateInput {
  sourceKey: string;
  rolloutPhase: number;
  destination: string;
  sourceName: string;
  sourcePageUrl: string;
  sourceTrackUrl?: string | null;
  sourceExternalId?: string | null;
  routeName: string;
  country: string;
  region?: string | null;
  county?: string | null;
  discipline: "road" | "gravel" | "mtb" | "unknown";
  routeFormat: "loop" | "linear" | "out_and_back" | "unknown";
  distanceKm?: number | null;
  elevationGainM?: number | null;
  sourceEvidence: string;
  sourceClaimsRecorded: boolean;
  sourceAuthorName?: string | null;
  sourceRecordedAt?: string | null;
  sourceValidationStatus?: "metadata_checked" | "locally_curated" | "publisher_claims_ridden";
  sourceValidationBasis?: string;
  acquisitionTarget?: string | null;
  nextAction: string;
}

function decodeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&apos;": "'",
    "&#39;": "'",
    "&quot;": '"',
    "&nbsp;": " ",
    "&ndash;": "–",
    "&mdash;": "—",
  };
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|apos|#39|quot|nbsp|ndash|mdash);/g, (entity) => entities[entity] || entity)
    .replace(/\s+/g, " ")
    .trim();
}

function numeric(value: string | undefined): number | null {
  if (!value) return null;
  const token = value.match(/\d[\d.,]*/)?.[0];
  if (!token) return null;
  const normalized = token.includes(",")
    ? token.includes(".")
      ? token.lastIndexOf(",") > token.lastIndexOf(".")
        ? token.replace(/\./g, "").replace(",", ".")
        : token.replace(/,/g, "")
      : /^\d{1,3},\d{3}$/.test(token)
        ? token.replace(",", "")
        : token.replace(",", ".")
    : /^\d{1,3}\.\d{3}$/.test(token)
      ? token.replace(".", "")
      : token;
  return Number(normalized);
}

function routeFormatFromName(name: string): SourceCandidateInput["routeFormat"] {
  return /\b(loop|circular|circuit)\b/i.test(name) ? "loop" : "unknown";
}

function keySlug(value: string): string {
  return decodeHtml(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function parseCyclingIreland(html: string): SourceCandidateInput[] {
  const results: SourceCandidateInput[] = [];
  for (const match of html.matchAll(/<li>[\s\S]*?data-src="\/route-popup-content\.asp\?ID=(\d+)"[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>[\s\S]*?<div class="stats">([\s\S]*?)<\/div>[\s\S]*?<\/li>/gi)) {
    const [, externalId, rawName, rawStats] = match;
    const stats = [...rawStats.matchAll(/<span class="stat">[\s\S]*?<\/i>([\s\S]*?)<\/span>/gi)]
      .map((stat) => decodeHtml(stat[1]));
    const routeName = decodeHtml(rawName);
    const distance = stats.find((stat) => /km/i.test(stat));
    const county = stats.find((stat) => !/km/i.test(stat)) || null;
    results.push({
      sourceKey: `cycling-ireland:${externalId}`,
      rolloutPhase: 1,
      destination: "Ireland",
      sourceName: "Cycling Ireland",
      sourcePageUrl: "https://www.cyclingireland.ie/key-documents/find-a-route/",
      sourceTrackUrl: `https://www.cyclingireland.ie/route-popup-content.asp?ID=${externalId}`,
      sourceExternalId: externalId,
      routeName,
      country: "Ireland",
      county,
      discipline: "road",
      routeFormat: routeFormatFromName(routeName),
      distanceKm: numeric(distance),
      sourceEvidence: "national_governing_body_route_index",
      sourceClaimsRecorded: false,
      acquisitionTarget: "Cycling Ireland local expert or route maintainer",
      nextAction: "Find the named rider for a current exact version and request their personal timestamped recording.",
    });
  }
  return results;
}

function articleAttribute(article: string, name: string): string | null {
  const match = article.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? decodeHtml(match[1]) : null;
}

export function parseSportIreland(html: string): SourceCandidateInput[] {
  const results: SourceCandidateInput[] = [];
  for (const match of html.matchAll(/<article\b([^>]*\bdata-trail-id="[^"]+"[^>]*)>/gi)) {
    const attributes = match[1];
    const externalId = articleAttribute(attributes, "data-trail-id");
    const routeName = articleAttribute(attributes, "data-trail-title");
    const relativeUrl = articleAttribute(attributes, "data-trail-url");
    if (!externalId || !routeName || !relativeUrl) continue;
    const format = articleAttribute(attributes, "data-trail-format")?.toLowerCase();
    results.push({
      sourceKey: `sport-ireland:${externalId}`,
      rolloutPhase: 1,
      destination: "Ireland",
      sourceName: "Sport Ireland Outdoors",
      sourcePageUrl: "https://www.sportireland.ie/outdoors/cycling-on-road/trails",
      sourceTrackUrl: new URL(relativeUrl, "https://www.sportireland.ie").toString(),
      sourceExternalId: externalId,
      routeName,
      country: "Ireland",
      county: articleAttribute(attributes, "data-trail-county"),
      discipline: "road",
      routeFormat: format === "loop" ? "loop" : format === "linear" ? "linear" : "unknown",
      distanceKm: numeric(articleAttribute(attributes, "data-trail-length") || undefined),
      sourceEvidence: "official_outdoor_trail_index",
      sourceClaimsRecorded: false,
      acquisitionTarget: "Trail manager or named local rider",
      nextAction: "Ask the trail manager to nominate someone who recently rode the exact current route and can submit their own recording.",
    });
  }
  return results;
}

export function parseMallorcaVelo(html: string): SourceCandidateInput[] {
  const bySlug = new Map<string, SourceCandidateInput>();
  for (const match of html.matchAll(/<a href="(\/routes\/([^"#]+))"[^>]*>[\s\S]*?<span class="nav-entry-label">([\s\S]*?)<\/span>[\s\S]*?<span class="nav-entry-meta">([\s\S]*?)<\/span>/gi)) {
    const [, path, slug, rawName, rawDistance] = match;
    if (bySlug.has(slug)) continue;
    bySlug.set(slug, {
      sourceKey: `mallorca-velo:${slug}`,
      rolloutPhase: 3,
      destination: "Mallorca",
      sourceName: "MallorcaVelo",
      sourcePageUrl: "https://mallorcavelo.com/routes/",
      sourceTrackUrl: new URL(path, "https://mallorcavelo.com").toString(),
      sourceExternalId: slug,
      routeName: decodeHtml(rawName),
      country: "Spain",
      region: "Balearic Islands",
      county: "Mallorca",
      discipline: "road",
      routeFormat: "unknown",
      distanceKm: numeric(decodeHtml(rawDistance)),
      sourceEvidence: "publisher_reconstruction_of_signposted_route",
      sourceClaimsRecorded: false,
      acquisitionTarget: "Mallorca guide or local rider",
      nextAction: "Recruit a named rider to ride and record this exact version; do not treat the reconstructed GPX as ride evidence.",
    });
  }
  return [...bySlug.values()];
}

export function parseCurroBikes(html: string): SourceCandidateInput[] {
  const results: SourceCandidateInput[] = [];
  const cards = html.split(/<div class="cbr-card"/i).slice(1);
  for (const card of cards) {
    const externalId = card.match(/id="cbr-([^"]+)"/i)?.[1];
    const routeName = decodeHtml(card.match(/<h2 class="cbr-card-name">([\s\S]*?)<\/h2>/i)?.[1] || "");
    if (!externalId || !routeName || /gravel/i.test(routeName)) continue;
    const specValues = [...card.matchAll(/<div class="cbr-spec-val">([\s\S]*?)<\/div>/gi)]
      .slice(0, 2)
      .map((match) => decodeHtml(match[1]));
    const type = decodeHtml(card.match(/<span class="cbr-badge-type">([\s\S]*?)<\/span>/i)?.[1] || "");
    results.push({
      sourceKey: `curro-bikes:${externalId}`,
      rolloutPhase: 3,
      destination: "Mallorca",
      sourceName: "CurroBikes",
      sourcePageUrl: "https://currobikes.es/rutas",
      sourceTrackUrl: `https://currobikes.es/wp-admin/admin-ajax.php?action=cb3_download_gpx&route=${encodeURIComponent(externalId)}`,
      sourceExternalId: externalId,
      routeName,
      country: "Spain",
      region: "Balearic Islands",
      county: "Mallorca",
      discipline: "road",
      routeFormat: /circular/i.test(type) ? "loop" : "unknown",
      distanceKm: numeric(specValues[0]),
      elevationGainM: numeric(specValues[1]),
      sourceEvidence: "bike_shop_route_library_with_public_track",
      sourceClaimsRecorded: false,
      acquisitionTarget: "CurroBikes guide or named Mallorca rider",
      nextAction: "Ask for the named rider behind the current track and require a fresh personal recording plus publication consent.",
    });
  }
  return results;
}

export function parseMallorcaCyclingCenter(html: string): SourceCandidateInput[] {
  const results: SourceCandidateInput[] = [];
  for (const match of html.matchAll(/<a href="(https:\/\/www\.mallorcacyclingcenter\.com\/routes\/([^"\s]+))\s*"?[^>]*class="[^"]*\btrack\b[^"]*"[^>]*>[\s\S]*?<h2>(\d+)\s+([\s\S]*?)<\/h2><span>([\s\S]*?)<\/span>/gi)) {
    const [, url, slug, , rawName, rawStats] = match;
    const stats = decodeHtml(rawStats).split("/");
    results.push({
      sourceKey: `mallorca-cycling-center:${slug}`,
      rolloutPhase: 3,
      destination: "Mallorca",
      sourceName: "Mallorca Cycling Center",
      sourcePageUrl: "https://www.mallorcacyclingcenter.com/routes/",
      sourceTrackUrl: url,
      sourceExternalId: slug,
      routeName: decodeHtml(rawName),
      country: "Spain",
      region: "Balearic Islands",
      county: "Mallorca",
      discipline: "road",
      routeFormat: "unknown",
      distanceKm: numeric(stats[0]),
      elevationGainM: numeric(stats[1]),
      sourceEvidence: "bike_hire_route_library",
      sourceClaimsRecorded: false,
      acquisitionTarget: "Mallorca Cycling Center guide or named rider",
      nextAction: "Nominate the guide who knows this route, then collect that rider's exact timestamped version and consent.",
    });
  }
  return results;
}

export function parseBikePointTenerife(html: string): SourceCandidateInput[] {
  const results: SourceCandidateInput[] = [];
  for (const card of html.split(/<article class="gps-route-card\s+/i).slice(1)) {
    const openingTag = card.slice(0, card.indexOf(">"));
    const externalId = openingTag.match(/\bpost-(\d+)\b/)?.[1];
    const routeName = decodeHtml(openingTag.match(/data-title="([^"]*)"/i)?.[1] || "");
    const type = openingTag.match(/data-type="([^"]*)"/i)?.[1]?.toLowerCase();
    if (!externalId || !routeName || !["road", "challenge"].includes(type || "") || /\b(mtb|gravel)\b/i.test(routeName)) continue;
    const start = decodeHtml(openingTag.match(/data-start="([^"]*)"/i)?.[1] || "");
    const finish = decodeHtml(openingTag.match(/data-finish="([^"]*)"/i)?.[1] || "");
    const detailUrl = card.match(/<h3><a href="([^"]+)">/i)?.[1] || null;
    const distanceKm = numeric(openingTag.match(/data-distance="([^"]*)"/i)?.[1]);
    const elevationGainM = numeric(openingTag.match(/data-ascent="([^"]*)"/i)?.[1]);
    if (distanceKm == null || elevationGainM == null) continue;
    const hasKnownEndpoints = start && finish && !/not specified/i.test(`${start} ${finish}`);
    results.push({
      sourceKey: `bike-point-tenerife:${externalId}`,
      rolloutPhase: 4,
      destination: "Tenerife",
      sourceName: "Bike Point Tenerife",
      sourcePageUrl: "https://bikepointtenerife.com/download-gps-bike-routes-in-tenerife/",
      sourceTrackUrl: detailUrl,
      sourceExternalId: externalId,
      routeName,
      country: "Spain",
      region: "Canary Islands",
      county: "Tenerife",
      discipline: "road",
      routeFormat: hasKnownEndpoints ? (start === finish ? "loop" : "linear") : routeFormatFromName(routeName),
      distanceKm,
      elevationGainM,
      sourceEvidence: "local_bike_shop_route_library_with_public_tracks",
      sourceClaimsRecorded: false,
      sourceValidationStatus: "locally_curated",
      sourceValidationBasis: "Local bike shop says the library was built by people who ride in Tenerife; route card, endpoints and statistics checked.",
      acquisitionTarget: "Bike Point Tenerife route author or guide",
      nextAction: "Ask Bike Point to identify the guide behind the exact route version, then collect that rider's own timestamped export and consent.",
    });
  }
  return results;
}

export function parseCyclingCalpe(html: string): SourceCandidateInput[] {
  const results: SourceCandidateInput[] = [];
  for (const card of html.split(/<article class="flex flex-col overflow-hidden/i).slice(1)) {
    const routeName = decodeHtml(card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "");
    const gpxPath = card.match(/href="(\/gpx\/([^"]+\.gpx))"/i);
    if (!routeName || !gpxPath) continue;
    const stravaUrl = card.match(/href="(https:\/\/www\.strava\.com\/routes\/[^"]+)"/i)?.[1] || null;
    const facts = routeName.match(/(\d+(?:\.\d+)?)\s*km\s*-\s*(\d+(?:\.\d+)?)\s*m/i);
    results.push({
      sourceKey: `cycling-calpe:${gpxPath[2].replace(/\.gpx$/i, "")}`,
      rolloutPhase: 4,
      destination: "Calpe / Costa Blanca",
      sourceName: "Cycling Calpe",
      sourcePageUrl: "https://www.cyclingcalpe.eu/",
      sourceTrackUrl: stravaUrl,
      sourceExternalId: gpxPath[2].replace(/\.gpx$/i, ""),
      routeName,
      country: "Spain",
      region: "Valencian Community",
      county: "Alicante",
      discipline: "road",
      routeFormat: /\bloop\b/i.test(decodeHtml(card.slice(0, 8_000))) ? "loop" : "unknown",
      distanceKm: numeric(facts?.[1]),
      elevationGainM: numeric(facts?.[2]),
      sourceEvidence: "destination_operator_route_library_with_gpx_and_strava",
      sourceClaimsRecorded: false,
      sourceValidationStatus: "locally_curated",
      sourceValidationBasis: "Dedicated Calpe cycling operator publishes a loop description, GPX and Strava route for each checked card.",
      acquisitionTarget: "Cycling Calpe route author or local ride host",
      nextAction: "Identify the local rider responsible for this exact loop and request a current personal recording plus publication consent.",
    });
  }
  return results;
}

export function parseLanzaroteBike(html: string): SourceCandidateInput[] {
  const start = html.search(/>Road bike routes</i);
  const end = html.search(/>MTB Routes</i);
  if (start < 0 || end <= start) return [];
  const section = html.slice(start, end);
  const headings = [...section.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)];
  return headings.map((heading, index) => {
    const routeName = decodeHtml(heading[1]);
    const segment = section.slice(heading.index, headings[index + 1]?.index ?? section.length);
    const plain = decodeHtml(segment);
    const komootUrl = segment.match(/href="(https:\/\/(?:www\.)?komoot\.com\/[^"]+)"/i)?.[1] || null;
    return {
      sourceKey: `lanzarote-bike:${keySlug(routeName)}`,
      rolloutPhase: 4,
      destination: "Lanzarote",
      sourceName: "Lanzarote Bike",
      sourcePageUrl: "https://en.lanzarotebike.com/routes",
      sourceTrackUrl: komootUrl,
      sourceExternalId: keySlug(routeName),
      routeName,
      country: "Spain",
      region: "Canary Islands",
      county: "Lanzarote",
      discipline: "road" as const,
      routeFormat: /\bloop\b/i.test(plain) || /around the island/i.test(routeName) ? "loop" as const : "unknown" as const,
      distanceKm: numeric(plain.match(/Distance:\s*([\d.,]+)\s*km/i)?.[1]),
      elevationGainM: numeric(plain.match(/Elevation gain:\s*([\d.,]+)\s*m/i)?.[1]),
      sourceEvidence: "local_bike_shop_route_library_with_gpx_and_komoot",
      sourceClaimsRecorded: false,
      sourceValidationStatus: "locally_curated" as const,
      sourceValidationBasis: "Lanzarote bike shop publishes road-only route descriptions, statistics and linked GPX/Komoot references.",
      acquisitionTarget: "Lanzarote Bike guide or route author",
      nextAction: "Ask the shop to nominate the guide who rides this exact version and collect a current first-party recording and consent.",
    };
  });
}

export function parseTuscanyTrail365(html: string): SourceCandidateInput[] {
  const results: SourceCandidateInput[] = [];
  for (const match of html.matchAll(/<a class="itxcard" data-type="Road" href="([^"]+)"[\s\S]*?<span class="rcard-badge road"[\s\S]*?<b[^>]*>([\s\S]*?)<\/b>[\s\S]*?<span class="itx-meta"[\s\S]*?<b[^>]*>([\d.,]+)\s*km<\/b>[\s\S]*?<span[^>]*>([\d.,]+)\s*m D\+<\/span>[\s\S]*?<\/a>/gi)) {
    const [, path, rawName, rawDistance, rawElevation] = match;
    const routeName = decodeHtml(rawName);
    const externalId = path.split("/").filter(Boolean).at(-1) || keySlug(routeName);
    results.push({
      sourceKey: `tuscany-trail-365:${externalId}`,
      rolloutPhase: 4,
      destination: "Tuscany",
      sourceName: "Tuscany Trail 365",
      sourcePageUrl: "https://cyclingintuscany.tuscanytrail.it/itinerari/",
      sourceTrackUrl: new URL(path, "https://cyclingintuscany.tuscanytrail.it").toString(),
      sourceExternalId: externalId,
      routeName,
      country: "Italy",
      region: "Tuscany",
      county: null,
      discipline: "road",
      routeFormat: "loop",
      distanceKm: numeric(rawDistance),
      elevationGainM: numeric(rawElevation),
      sourceEvidence: "publisher_explicitly_claims_designed_ridden_verified",
      sourceClaimsRecorded: false,
      sourceValidationStatus: "publisher_claims_ridden",
      sourceValidationBasis: "Publisher explicitly says every listed route was designed, ridden and verified by the Tuscany Trail team; exact rider evidence remains unconfirmed.",
      acquisitionTarget: "Tuscany Trail route designer or named verification rider",
      nextAction: "Identify the person who rode this exact version and obtain their timestamped source file, identity confirmation and publication rights.",
    });
  }
  return results;
}

export function parseWebTenerife(html: string): SourceCandidateInput[] {
  const results: SourceCandidateInput[] = [];
  for (const match of html.matchAll(/<article class="card card--background">[\s\S]*?<a class="card__link" href=(https:\/\/www\.webtenerife\.co\.uk\/what-to-do\/routes\/cycling\/([^>]+?)\/)>[\s\S]*?<h3[^>]*>\s*Route\s+(\d+)\s*<\/h3>[\s\S]*?<div class="card__description">([\s\S]*?)<\/div>/gi)) {
    const [, url, pathSlug, routeNumber, rawDescription] = match;
    const description = decodeHtml(rawDescription);
    const routeName = `Tenerife Official Route ${routeNumber} — ${pathSlug.split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" · ")}`;
    results.push({
      sourceKey: `web-tenerife:route-${routeNumber}`,
      rolloutPhase: 4,
      destination: "Tenerife",
      sourceName: "Tenerife Tourism",
      sourcePageUrl: "https://www.webtenerife.co.uk/what-to-do/routes/cycling/",
      sourceTrackUrl: url,
      sourceExternalId: routeNumber,
      routeName,
      country: "Spain",
      region: "Canary Islands",
      county: "Tenerife",
      discipline: "road",
      routeFormat: routeNumber === "4" ? "linear" : "loop",
      distanceKm: numeric(description.match(/Distance:\s*([\d.,]+)\s*km/i)?.[1]),
      elevationGainM: numeric(description.match(/Cumulative ascent:\s*([\d.,]+)\s*m/i)?.[1]),
      sourceEvidence: "official_destination_road_route_index",
      sourceClaimsRecorded: false,
      sourceValidationStatus: "locally_curated",
      sourceValidationBasis: "Official Tenerife tourism route card, endpoints, distance and ascent checked against its current cycling index.",
      acquisitionTarget: "Tenerife Tourism route maintainer or nominated local rider",
      nextAction: "Use the official route owner to identify a named recent rider; require that rider's own timestamped recording and consent.",
    });
  }
  return results;
}
