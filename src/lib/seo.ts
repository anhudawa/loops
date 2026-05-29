// ============================================================
// seo.ts — SEO utility functions: slugify, JSON-LD generators
// ============================================================

// ── Slug utilities ──

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── JSON-LD generators ──

interface RouteJsonLdInput {
  id: string;
  name: string;
  description: string | null;
  start_lat: number;
  start_lng: number;
  county: string;
  country: string;
  region: string | null;
  distance_km: number;
  elevation_gain_m: number;
  surface_type: string;
  discipline: string;
  rating?: { average: number; count: number };
}

export function generateRouteJsonLd(route: RouteJsonLdInput) {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ExerciseAction",
    name: route.name,
    description: route.description || `${route.discipline} route in ${route.region || route.county}, ${route.country}`,
    url: `https://loops.ie/routes/${route.id}`,
    exerciseType: route.discipline.charAt(0).toUpperCase() + route.discipline.slice(1),
    distance: {
      "@type": "Distance",
      name: `${route.distance_km} km`,
    },
    image: `https://loops.ie/api/og/${route.id}`,
    location: {
      "@type": "Place",
      name: `${route.region || route.county}, ${route.country}`,
      geo: {
        "@type": "GeoCoordinates",
        latitude: route.start_lat,
        longitude: route.start_lng,
      },
      address: {
        "@type": "PostalAddress",
        addressRegion: route.region || route.county,
        addressCountry: route.country,
      },
    },
    additionalProperty: [
      { "@type": "PropertyValue", name: "Elevation Gain", value: `${route.elevation_gain_m} m` },
      { "@type": "PropertyValue", name: "Surface", value: route.surface_type.charAt(0).toUpperCase() + route.surface_type.slice(1) },
    ],
  };

  if (route.rating && route.rating.count > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: route.rating.average,
      reviewCount: route.rating.count,
    };
  }

  return jsonLd;
}

interface SportsActivityLocationInput {
  id: string;
  name: string;
  description: string | null;
  start_lat: number;
  start_lng: number;
  county: string;
  country: string;
  region: string | null;
  distance_km: number;
  elevation_gain_m: number;
  surface_type: string;
  discipline: string;
  rating?: { average: number; count: number };
}

// SportsActivityLocation describes the route as a place you go to ride —
// the type answer engines map to "where can I cycle in X" queries.
export function generateSportsActivityLocationJsonLd(route: SportsActivityLocationInput) {
  const location = route.region || route.county;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: route.name,
    description:
      route.description ||
      `${route.distance_km}km ${route.discipline} cycling route in ${location}, ${route.country} with ${route.elevation_gain_m}m of climbing.`,
    url: `https://loops.ie/routes/${route.id}`,
    image: `https://loops.ie/api/og/${route.id}`,
    sport: `${cap(route.discipline)} cycling`,
    geo: {
      "@type": "GeoCoordinates",
      latitude: route.start_lat,
      longitude: route.start_lng,
    },
    address: {
      "@type": "PostalAddress",
      addressRegion: location,
      addressCountry: route.country,
    },
    additionalProperty: [
      { "@type": "PropertyValue", name: "Distance", value: `${route.distance_km} km`, unitCode: "KMT" },
      { "@type": "PropertyValue", name: "Elevation Gain", value: `${route.elevation_gain_m} m`, unitCode: "MTR" },
      { "@type": "PropertyValue", name: "Surface", value: cap(route.surface_type) },
      { "@type": "PropertyValue", name: "Discipline", value: cap(route.discipline) },
    ],
  };

  if (route.rating && route.rating.count > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: route.rating.average,
      reviewCount: route.rating.count,
    };
  }

  return jsonLd;
}

// ── Route FAQ content (shared by visible block + FAQPage JSON-LD) ──

interface RouteFaqInput {
  name: string;
  distance_km: number;
  elevation_gain_m: number;
  surface_type: string;
  discipline: string;
}

// Rough ride-time estimate using distance + climbing. Average recreational
// cyclist ~22 km/h on road, slower on gravel/mtb, plus ~1 min per 10m climbed.
function estimateRideTime(input: RouteFaqInput): string {
  const baseSpeed = input.discipline === "road" ? 22 : input.discipline === "gravel" ? 17 : 12;
  const climbingMinutes = input.elevation_gain_m / 10;
  const totalMinutes = (input.distance_km / baseSpeed) * 60 + climbingMinutes;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours === 0) return `${minutes} minutes`;
  if (minutes === 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
  return `${hours} hour${hours > 1 ? "s" : ""} ${minutes} minutes`;
}

function beginnerSuitability(input: RouteFaqInput): string {
  const climbPerKm = input.distance_km > 0 ? input.elevation_gain_m / input.distance_km : 0;
  const techDiscipline = input.discipline === "mtb";
  if (techDiscipline) {
    return `${input.name} is an MTB route, so it suits riders comfortable with off-road and technical terrain rather than complete beginners. New mountain bikers should walk the harder sections until confident.`;
  }
  if (input.distance_km <= 40 && climbPerKm < 10) {
    return `Yes. At ${input.distance_km}km with only ${input.elevation_gain_m}m of climbing, ${input.name} is a manageable ${input.discipline} route for beginners and anyone building fitness. Ride at your own pace and take breaks on the climbs.`;
  }
  if (input.distance_km <= 80 && climbPerKm < 15) {
    return `${input.name} is a moderate ${input.distance_km}km ${input.discipline} route with ${input.elevation_gain_m}m of climbing. Beginners can complete it with a little base fitness — allow extra time and pace the climbs.`;
  }
  return `${input.name} is a challenging ${input.distance_km}km ${input.discipline} route with ${input.elevation_gain_m}m of climbing, better suited to experienced riders with good endurance. Beginners should build up to it on shorter routes first.`;
}

function bikeRecommendation(input: RouteFaqInput): string {
  switch (input.discipline) {
    case "road":
      return `A road bike with road tyres (25-32mm) is ideal for ${input.name}. The surface is ${input.surface_type}, so a gravel or endurance bike works well too if you prefer wider tyres.`;
    case "gravel":
      return `A gravel bike with 35-45mm tyres is best for ${input.name}. A mountain bike or a road bike with wide, durable tyres can also handle the ${input.surface_type} surface.`;
    case "mtb":
      return `A mountain bike with knobbly tyres and front suspension is recommended for ${input.name}. The ${input.surface_type} terrain is not suitable for road or gravel bikes.`;
    default:
      return `Choose a bike that matches the ${input.surface_type} surface of ${input.name}.`;
  }
}

export function buildRouteFaqs(input: RouteFaqInput): FaqItem[] {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return [
    {
      question: `Is ${input.name} suitable for beginners?`,
      answer: beginnerSuitability(input),
    },
    {
      question: `How long does ${input.name} take to ride?`,
      answer: `${input.name} is ${input.distance_km}km with ${input.elevation_gain_m}m of climbing. Most riders complete it in around ${estimateRideTime(input)}, depending on fitness, stops, and conditions.`,
    },
    {
      question: `What bike do I need for ${input.name}?`,
      answer: bikeRecommendation(input),
    },
    {
      question: `How do I ride ${input.name}?`,
      answer: `Download the free GPX file from this page and load it onto Strava, Komoot, Wahoo, or Garmin to follow the ${cap(input.discipline)} route turn by turn.`,
    },
  ];
}

export function generateOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Loops.ie",
    url: "https://loops.ie",
    description: "Discover cycling routes across Ireland",
  };
}

export function generateWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "LOOPS",
    url: "https://loops.ie",
    description: "Find and share the best cycling routes worldwide",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://loops.ie/?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };
}

interface BreadcrumbItem {
  name: string;
  url?: string;
}

export function generateBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => {
      const element: Record<string, unknown> = {
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
      };
      if (item.url) {
        element.item = item.url;
      }
      return element;
    }),
  };
}

interface FaqItem {
  question: string;
  answer: string;
}

export function generateFaqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

interface ItemListRoute {
  name: string;
  id: string;
}

export function generateItemListJsonLd(name: string, routes: ItemListRoute[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: routes.length,
    itemListElement: routes.map((route, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: route.name,
      url: `https://loops.ie/routes/${route.id}`,
    })),
  };
}

interface CollectionJsonLdInput {
  name: string;
  slug: string;
  description: string | null;
  location: string | null;
  country: string | null;
  routes: { id: string; name: string; distance_km: number }[];
}

export function generateCollectionJsonLd(collection: CollectionJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: collection.name,
    description: collection.description || `Curated cycling routes${collection.location ? ` in ${collection.location}` : ""}`,
    url: `https://loops.ie/collections/${collection.slug}`,
    numberOfItems: collection.routes.length,
    itemListElement: collection.routes.map((route, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: route.name,
      url: `https://loops.ie/routes/${route.id}`,
    })),
  };
}
