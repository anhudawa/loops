import { describe, it, expect } from "vitest";
import { slugify, generateRouteJsonLd, generateBreadcrumbJsonLd, generateFaqJsonLd, generateItemListJsonLd } from "@/lib/seo";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Ireland")).toBe("ireland");
    expect(slugify("United Kingdom")).toBe("united-kingdom");
    expect(slugify("West Cork")).toBe("west-cork");
  });

  it("handles already-slugified input", () => {
    expect(slugify("ireland")).toBe("ireland");
  });

  it("transliterates accented characters", () => {
    expect(slugify("Rhône-Alpes")).toBe("rhone-alpes");
    expect(slugify("São Paulo")).toBe("sao-paulo");
  });

  it("preserves existing hyphens in names", () => {
    expect(slugify("Castlebar-Westport")).toBe("castlebar-westport");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("New  South  Wales")).toBe("new-south-wales");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify(" Ireland ")).toBe("ireland");
  });
});

describe("generateRouteJsonLd", () => {
  const baseRoute: Parameters<typeof generateRouteJsonLd>[0] = {
    id: "abc123",
    name: "Test Route",
    description: "A great route",
    start_lat: 53.5,
    start_lng: -7.5,
    county: "Cork",
    country: "Ireland",
    region: "West Cork",
    distance_km: 45,
    elevation_gain_m: 620,
    difficulty: "moderate",
    surface_type: "gravel",
    discipline: "gravel",
  };

  it("generates valid SportsActivityLocation schema", () => {
    const result = generateRouteJsonLd(baseRoute);
    expect(result["@type"]).toBe("SportsActivityLocation");
    expect(result.url).toBe("https://loops.ie/routes/abc123");
    expect(result.sport).toBe("Cycling");
  });

  it("includes aggregateRating only when count > 0", () => {
    const withRating = generateRouteJsonLd({ ...baseRoute, rating: { average: 4.2, count: 8 } });
    expect(withRating.aggregateRating).toBeDefined();

    const withoutRating = generateRouteJsonLd(baseRoute);
    expect(withoutRating.aggregateRating).toBeUndefined();

    const zeroRating = generateRouteJsonLd({ ...baseRoute, rating: { average: 0, count: 0 } });
    expect(zeroRating.aggregateRating).toBeUndefined();
  });

  it("falls back to county when region is null", () => {
    const result = generateRouteJsonLd({ ...baseRoute, region: null });
    const address = result.address as { addressRegion: string };
    expect(address.addressRegion).toBe("Cork");
  });
});

describe("generateBreadcrumbJsonLd", () => {
  it("generates correct positions and omits item for last entry", () => {
    const result = generateBreadcrumbJsonLd([
      { name: "LOOPS", url: "https://loops.ie" },
      { name: "Ireland", url: "https://loops.ie/routes/country/ireland" },
      { name: "Route Name" },
    ]);
    expect(result.itemListElement).toHaveLength(3);
    expect(result.itemListElement[0].position).toBe(1);
    expect(result.itemListElement[2].item).toBeUndefined();
  });
});

describe("generateFaqJsonLd", () => {
  it("generates FAQPage schema", () => {
    const result = generateFaqJsonLd([
      { question: "How long?", answer: "45km" },
    ]);
    expect(result["@type"]).toBe("FAQPage");
    expect(result.mainEntity).toHaveLength(1);
    expect(result.mainEntity[0]["@type"]).toBe("Question");
  });
});

describe("generateItemListJsonLd", () => {
  it("generates ItemList with correct count and URLs", () => {
    const result = generateItemListJsonLd("Test List", [
      { name: "Route 1", id: "r1" },
      { name: "Route 2", id: "r2" },
    ]);
    expect(result.numberOfItems).toBe(2);
    expect(result.itemListElement[0].url).toBe("https://loops.ie/routes/r1");
  });
});
