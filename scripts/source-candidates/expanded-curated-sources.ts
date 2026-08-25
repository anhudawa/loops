import type { SourceCandidateInput } from "./source-parsers";

type CuratedRoute = {
  name: string;
  distanceKm: number;
  elevationGainM: number;
  format: SourceCandidateInput["routeFormat"];
};

function keySlug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const granCanaria: CuratedRoute[] = [
  { name: "GC210: Aldea, Artenara, Tejeda and Ayacata", distanceKm: 94, elevationGainM: 2980, format: "unknown" },
  { name: "GC503 and GC504: Ayagaures Loop", distanceKm: 32, elevationGainM: 620, format: "loop" },
  { name: "GC60 and GC65: Classic Maspalomas Route", distanceKm: 88, elevationGainM: 2060, format: "unknown" },
  { name: "Pico de las Nieves via Soria and Serenity", distanceKm: 114, elevationGainM: 2770, format: "unknown" },
  { name: "Valley of the Tears", distanceKm: 114, elevationGainM: 3360, format: "unknown" },
];

const dolomites: CuratedRoute[] = [
  { name: "Sellaronda Classic Loop from Corvara", distanceKm: 51.4, elevationGainM: 1710, format: "loop" },
  { name: "Sellaronda Counterclockwise plus Passo Giau Loop", distanceKm: 114, elevationGainM: 3590, format: "loop" },
  { name: "Passo Fedaia Loop from Corvara", distanceKm: 90, elevationGainM: 2760, format: "loop" },
  { name: "Monte Cristallo and Tre Cime Loop from Cortina", distanceKm: 54, elevationGainM: 1480, format: "loop" },
  { name: "Passo Cibiana, Staulanza and Giau Loop", distanceKm: 95, elevationGainM: 2820, format: "loop" },
];

const frenchAlps: CuratedRoute[] = [
  { name: "Alpe d'Huez Cycling Climb", distanceKm: 14, elevationGainM: 1120, format: "linear" },
  { name: "Col d'Ornon Loop", distanceKm: 111, elevationGainM: 2540, format: "loop" },
  { name: "Col de Sarenne Loop", distanceKm: 57, elevationGainM: 1980, format: "loop" },
  { name: "Croix de Fer and Glandon", distanceKm: 42, elevationGainM: 1650, format: "out_and_back" },
  { name: "Lautaret and Galibier from the South", distanceKm: 48, elevationGainM: 2390, format: "out_and_back" },
  { name: "Saint-Christophe-en-Oisans and La Bérarde", distanceKm: 33, elevationGainM: 1250, format: "out_and_back" },
  { name: "Villard-Reculas Loop", distanceKm: 34, elevationGainM: 910, format: "loop" },
];

function build(
  routes: CuratedRoute[],
  source: Omit<SourceCandidateInput, "sourceKey" | "sourceExternalId" | "routeName" | "routeFormat" | "distanceKm" | "elevationGainM">
): SourceCandidateInput[] {
  return routes.map((route) => ({
    ...source,
    sourceKey: `${keySlug(source.sourceName)}:${keySlug(source.destination)}:${keySlug(route.name)}`,
    sourceExternalId: keySlug(route.name),
    routeName: route.name,
    routeFormat: route.format,
    distanceKm: route.distanceKm,
    elevationGainM: route.elevationGainM,
  }));
}

export const expandedCuratedCandidates: SourceCandidateInput[] = [
  ...build(granCanaria, {
    rolloutPhase: 4,
    destination: "Gran Canaria",
    sourceName: "Epic Road Rides",
    sourcePageUrl: "https://epicroadrides.com/destinations/cycling-spain/gran-canaria/",
    sourceTrackUrl: null,
    country: "Spain",
    region: "Canary Islands",
    county: "Gran Canaria",
    discipline: "road",
    sourceEvidence: "named_author_tried_route_guide_with_public_tracks",
    sourceClaimsRecorded: false,
    sourceAuthorName: "Clare Dewey",
    sourceValidationStatus: "publisher_claims_ridden",
    sourceValidationBasis: "Named author describes riding from a Gran Canaria base and publishes route-specific notes, distances, ascent and public tracks.",
    acquisitionTarget: "Clare Dewey or the named local collaborator for the exact route",
    nextAction: "Confirm the exact-version rider and acquire their personal timestamped export and commercial publication consent.",
  }),
  ...build(dolomites, {
    rolloutPhase: 4,
    destination: "Dolomites",
    sourceName: "CyclingHero",
    sourcePageUrl: "https://cyclinghero.cc/blog/cycling-the-dolomites-5-epic-routes-with-gpx-insider-tips",
    sourceTrackUrl: null,
    country: "Italy",
    region: "Dolomites",
    county: null,
    discipline: "road",
    sourceEvidence: "named_author_personally_ridden_route_guide_with_gpx",
    sourceClaimsRecorded: false,
    sourceAuthorName: "Bob Rogers",
    sourceValidationStatus: "publisher_claims_ridden",
    sourceValidationBasis: "Named author says the guide distils ten years of riding in the Dolomites and provides route-specific GPX, distances and ascent.",
    acquisitionTarget: "Bob Rogers or the CyclingHero guide who rode the exact version",
    nextAction: "Invite the exact-version rider to submit their own timestamped recording and grant LOOPS publication rights.",
  }),
  ...build(frenchAlps, {
    rolloutPhase: 4,
    destination: "Alpe d'Huez / Oisans",
    sourceName: "Epic Road Rides",
    sourcePageUrl: "https://epicroadrides.com/destinations/cycling-france/alpe-d-huez-region/",
    sourceTrackUrl: null,
    country: "France",
    region: "Auvergne-Rhône-Alpes",
    county: "Isère",
    discipline: "road",
    sourceEvidence: "named_author_destination_route_guide_with_public_tracks",
    sourceClaimsRecorded: false,
    sourceAuthorName: "Clare Dewey",
    sourceValidationStatus: "publisher_claims_ridden",
    sourceValidationBasis: "Named cyclist-author publishes route-specific notes and checked distance/ascent figures from the Bourg d'Oisans base.",
    acquisitionTarget: "Clare Dewey or the named Oisans rider behind the exact route",
    nextAction: "Identify the exact-version rider, recheck current mountain-road conditions and acquire first-party evidence and rights.",
  }),
];
