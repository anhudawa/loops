export interface SourceCandidateInput {
  sourceKey: string;
  rolloutPhase: 1 | 2 | 3;
  destination: "Ireland" | "Girona" | "Mallorca";
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
    ? token.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}\.\d{3}$/.test(token)
      ? token.replace(".", "")
      : token;
  return Number(normalized);
}

function routeFormatFromName(name: string): SourceCandidateInput["routeFormat"] {
  return /\b(loop|circular|circuit)\b/i.test(name) ? "loop" : "unknown";
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
