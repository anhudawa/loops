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
