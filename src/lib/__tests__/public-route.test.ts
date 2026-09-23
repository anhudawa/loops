import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  stripOperatorAttribution,
  withPublicDescription,
  publicRoute,
  routeCard,
} from "@/lib/public-route";

describe("stripOperatorAttribution", () => {
  it("removes the six live attribution phrasings", () => {
    const cases: [string, string][] = [
      [
        "Intermediate gravel loop through the rolling countryside near Girona. Quiet farm tracks. Curated by Eat Sleep Cycle.",
        "Intermediate gravel loop through the rolling countryside near Girona. Quiet farm tracks.",
      ],
      [
        "Epic all-day gravel adventure through the Empordà. A signature Eat Sleep Cycle route.",
        "Epic all-day gravel adventure through the Empordà.",
      ],
      [
        "Technical unpaved sections. A challenging gravel adventure from Eat Sleep Cycle.",
        "Technical unpaved sections.",
      ],
      [
        "Over 3,000m of climbing. One of Eat Sleep Cycle's most demanding routes.",
        "Over 3,000m of climbing.",
      ],
      [
        "Punchy coastal climbs. A signature Eat Sleep Cycle route showcasing Girona's coastline. Bring a jacket.",
        "Punchy coastal climbs. Bring a jacket.",
      ],
    ];
    for (const [input, expected] of cases) {
      expect(stripOperatorAttribution(input, "Eat Sleep Cycle")).toBe(expected);
    }
  });

  it("strips known operators even when operator_name is empty", () => {
    expect(stripOperatorAttribution("Big climbs. Curated by Eat Sleep Cycle.", null)).toBe("Big climbs.");
    expect(stripOperatorAttribution("A route by epic road rides! Coffee at Sóller.", undefined)).toBe("Coffee at Sóller.");
  });

  it("uses the row's own operator_name", () => {
    expect(stripOperatorAttribution("Ridden by Acme Velo guides. Quiet lanes.", "Acme Velo")).toBe("Quiet lanes.");
  });

  it("leaves clean text, decimals and abbreviations alone", () => {
    const d = "A 2.5 km climb to St. Feliu. Café at the top!";
    expect(stripOperatorAttribution(d, "Eat Sleep Cycle")).toBe(d);
  });

  it("never strips our own brand or an event route's own name", () => {
    expect(stripOperatorAttribution("Built by LOOPS. Flat.", "LOOPS")).toBe("Built by LOOPS. Flat.");
    const traka = "The La Traka gravel race route. 100km of gravel.";
    expect(stripOperatorAttribution(traka, "La Traka", "La Traka 100")).toBe(traka);
  });

  it("returns null when nothing is left, and passes null through", () => {
    expect(stripOperatorAttribution("Curated by Eat Sleep Cycle.", "Eat Sleep Cycle")).toBeNull();
    expect(stripOperatorAttribution(null, "Eat Sleep Cycle")).toBeNull();
  });
});

describe("public route payloads", () => {
  const row = {
    id: "r1",
    name: "Costa Brava Classic",
    description: "Coastal climbs. A signature Eat Sleep Cycle route.",
    operator_name: "Eat Sleep Cycle",
    operator_url: "https://example.com",
    created_by: "87b3f503-0000-4000-8000-000000000000",
    avg_score: 4.8,
    rating_count: 20,
  };

  it("no public description contains its own operator_name", () => {
    for (const out of [publicRoute(row), routeCard(row), withPublicDescription(row)]) {
      expect(String(out.description)).not.toContain("Eat Sleep Cycle");
    }
  });

  it("strips provenance and ratings", () => {
    const pr = publicRoute(row) as Record<string, unknown>;
    const card = routeCard(row);
    for (const k of ["operator_name", "operator_url", "created_by", "avg_score", "rating_count"]) {
      expect(pr).not.toHaveProperty(k);
      expect(card).not.toHaveProperty(k);
    }
  });

  it("no hub-data manifest description names its operator", () => {
    const dir = join(process.cwd(), "scripts/hub-data");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const manifest = JSON.parse(readFileSync(join(dir, f), "utf-8")) as Record<string, string>[];
      for (const r of manifest) {
        if (!r.description) continue;
        expect(stripOperatorAttribution(r.description, r.operator_name, r.name), `${f}: ${r.name}`).toBe(
          r.description,
        );
      }
    }
  });
});
