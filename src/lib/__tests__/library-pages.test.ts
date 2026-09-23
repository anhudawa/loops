import { describe, it, expect } from "vitest";
import {
  disciplineList,
  listDiscipline,
  mentionsHiddenDiscipline,
  regionCards,
  totalKm,
  visibleRoutes,
} from "@/app/routes/country/library";
import { destinations } from "@/content/destinations";
import { DESTINATION_GUIDES, guideForSearch } from "@/content/destination-guides";
import { lookupKnownPlace } from "@/lib/places-known";

describe("library page counts", () => {
  it("one region card per slug, tidiest name, counted", () => {
    const cards = regionCards([
      { region: "london" },
      { region: "London" },
      { region: "London" },
      { region: "Tipperary " },
      { region: null },
      { region: "  " },
    ]);
    expect(cards).toEqual([
      { name: "London", slug: "london", routeCount: 3 },
      { name: "Tipperary", slug: "tipperary", routeCount: 1 },
    ]);
  });

  it("hides broken tracks from the counted list", () => {
    // A "loop" ridden out and straight back along the same road: broken.
    const out: number[][] = [];
    for (let i = 0; i <= 200; i++) out.push([53 + i * 0.001, -6]);
    const back = [...out].reverse();
    const broken = { name: "Broken Loop", coordinates: JSON.stringify([...out, ...back]) };
    const fine = { name: "Fine", coordinates: "[]" };
    expect(visibleRoutes([broken, fine])).toEqual([fine]);
  });

  it("sums km and words disciplines", () => {
    expect(totalKm([{ distance_km: 10.4 }, { distance_km: "20.3" }, { distance_km: null }])).toBe(31);
    expect(disciplineList(["road"])).toBe("road");
    expect(disciplineList(["road", "gravel", "mtb"])).toBe("road, gravel and MTB");
  });

  it("badges a list by what it holds", () => {
    expect(listDiscipline([{ discipline: "road" }, { discipline: "road" }], "mixed")).toBe("road");
    expect(listDiscipline([{ discipline: "road" }, { discipline: "gravel" }], "road")).toBe("mixed");
    expect(listDiscipline([], "mixed")).toBe("road"); // v1: road only
  });

  it("spots stored copy promising a hidden discipline", () => {
    expect(mentionsHiddenDiscipline("Hand-picked road and gravel routes")).toBe(true);
    expect(mentionsHiddenDiscipline("Classic road climbs")).toBe(false);
    expect(mentionsHiddenDiscipline(null)).toBe(false);
  });
});

describe("destination guides", () => {
  it("the small guide index matches the guides", () => {
    expect(DESTINATION_GUIDES.map((g) => [g.slug, g.name])).toEqual(destinations.map((d) => [d.slug, d.name]));
  });

  it("a search naming a guide finds it; partial words do not", () => {
    expect(guideForSearch("Wicklow")?.slug).toBe("wicklow");
    expect(guideForSearch(" tuscany ")?.slug).toBe("lucca");
    expect(guideForSearch("cote d'azur")?.slug).toBe("nice");
    expect(guideForSearch("Gran Canaria")?.slug).toBe("gran-canaria");
    expect(guideForSearch("malaga")?.slug).toBe("malaga");
    expect(guideForSearch("nic")).toBeNull();
    expect(guideForSearch("")).toBeNull();
  });

  it("every guide's planner start is a place the planner resolves", () => {
    for (const d of destinations) {
      expect(lookupKnownPlace(d.plannerPlace), d.slug).not.toBeNull();
    }
  });
});
