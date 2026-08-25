import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAllSlugs } from "@/lib/blog";

function source(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

describe("Ireland road relaunch public positioning", () => {
  it("does not expose fresh-route creation controls in rider search", () => {
    const searchPage = source("src/app/generate/page.tsx");
    expect(searchPage).not.toContain("GeneratedCandidate");
    expect(searchPage).not.toContain("/api/routes/from-generated");
    expect(searchPage).not.toContain("RouteEditor");
    expect(searchPage).toContain("Every result has been ridden by a person");
  });

  it("keeps the discovery feed fixed to Irish road routes", () => {
    const home = source("src/app/_components/HomeClient.tsx");
    expect(home).not.toContain("DisciplineTabs");
    expect(home).toContain('params.set("discipline", "road")');
    expect(home).toContain('params.set("country", "Ireland")');
  });

  it("rejects any non-library candidate at the API boundary", () => {
    const endpoint = source("src/app/api/generate-route/route.ts");
    expect(endpoint).toContain("FRESH_ROUTE_POLICY_VIOLATION");
    expect(endpoint).toContain("UNSUPPORTED_DISCIPLINE");
    expect(endpoint).toContain("UNSUPPORTED_MARKET");
  });

  it("does not publish obsolete or unreviewed planned-market route guidance", () => {
    expect(getAllSlugs()).not.toContain("komoot-alternative-for-road-cyclists");
    expect(getAllSlugs()).not.toContain("cycling-in-girona-complete-guide");
    expect(getAllSlugs()).not.toContain("cycling-in-mallorca-routes-climbs-when-to-go");
    expect(getAllSlugs()).not.toContain("best-winter-cycling-training-camps-europe");
    expect(getAllSlugs()).not.toContain("cycling-in-wicklow-dublins-mountain-playground");
  });

  it("keeps route-library claims consistent with closed-beta access", () => {
    const countryPage = source("src/app/routes/country/[country]/page.tsx");
    const regionPage = source("src/app/routes/country/[country]/[region]/page.tsx");
    const blogPage = source("src/app/blog/[slug]/page.tsx");
    expect(countryPage).not.toContain("free GPX");
    expect(regionPage).not.toContain("free GPX");
    expect(blogPage).not.toContain("Tell our AI");
    expect(blogPage).toContain("Apply for the Ireland beta");
  });

  it("publishes destination pages only for Ireland and the two named next markets", () => {
    const destinationPage = source("src/app/cycling/[destination]/page.tsx");
    expect(destinationPage).toContain('new Set(["girona", "mallorca"])');
    expect(destinationPage).toContain('destination.country === "Ireland"');
    expect(destinationPage).toContain("LOOPS is not publishing route or road-condition guidance");
    expect(destinationPage).toContain("if (!active)");
  });

  it("does not use legacy account totals as public social proof", () => {
    const statsEndpoint = source("src/app/api/stats/route.ts");
    const loginPage = source("src/app/login/page.tsx");
    expect(statsEndpoint).not.toContain("communityResult");
    expect(statsEndpoint).not.toContain("COUNT(*) FROM users");
    expect(loginPage).not.toContain("stats.community");
  });
});
