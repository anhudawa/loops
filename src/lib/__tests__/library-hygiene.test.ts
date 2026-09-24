import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tidyRouteName } from "../public-route";
import { checkTrack } from "../track-shape";
import { ROAD_RULES_VERSION } from "../road-segments";
import corrections from "@/data/hub-bundles/library-corrections.json";

describe("tidyRouteName", () => {
  it("cleans the sloppy imported names riders saw", () => {
    expect(tidyRouteName("Battersea to Surrey Hills _ Feel the burn!!")).toBe("Battersea to the Surrey Hills");
    expect(tidyRouteName("Coffee and Cake day - Majorca")).toBe("Coffee and Cake Day, Mallorca");
    expect(tidyRouteName("Sunday  Social")).toBe("Sunday Social");
    expect(tidyRouteName("Great Girona ride ")).toBe("Great Girona Ride");
    expect(tidyRouteName("Les Serres + Mas Lunes (Road - Intermediate)")).toBe("Les Serres and Mas Llunes");
    expect(tidyRouteName("The Rupit Loop (Road - Epic)")).toBe("The Rupit Loop");
    expect(tidyRouteName("Mountain Day in Majorca")).toBe("Mountain Day in Mallorca");
    expect(tidyRouteName("Hills _ and dales!!")).toBe("Hills – and dales");
  });

  it("leaves clean names (and the bundle names it is matched by) alone", () => {
    for (const n of ["Cap Formentor", "Rocacorba, Girona", "Els Àngels Loop", "Sant Hilari Sacalm & Susqueda Dam",
      "Roadman Group Spin (Saturday Route)", "Coll de Femenia – Sa Batalla Loop", "Planned road route — 116.9 km", "Montseny 160km"]) {
      expect(tidyRouteName(n)).toBe(n);
    }
  });

  it("route manifests already carry tidy names (the importer dedupes by name)", () => {
    const dir = join(__dirname, "../../../scripts/hub-data");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const routes: Array<{ name?: string }> = Array.isArray(d) ? d : d.routes ?? [];
      for (const r of routes) if (r.name) expect(tidyRouteName(r.name), `${f}: ${r.name}`).toBe(r.name);
    }
  });
});

describe("library corrections (tracks that read as broken)", () => {
  const byName = new Map((corrections as Array<{ name: string; country: string; distance_km: number; coordinates: number[][]; road_report: { rules_version: number }; description: string }>).map((e) => [e.name, e]));

  it("Cap Formentor is the ride from Port de Pollença to the lighthouse and back", () => {
    const e = byName.get("Cap Formentor")!;
    const t = checkTrack(e.coordinates.map((c) => [c[0], c[1]] as [number, number]), e.name)!;
    expect(t.shape).toBe("out-and-back"); // the cape has one road
    expect(t.endsApartKm).toBeLessThan(1);
    expect(t.broken).toBeNull();
    expect(e.distance_km).toBeGreaterThan(35);
    expect(e.distance_km).toBeLessThan(45);
  });

  it("Rocacorba returns to Girona and reaches the summit", () => {
    const e = byName.get("Rocacorba, Girona")!;
    const coords = e.coordinates.map((c) => [c[0], c[1]] as [number, number]);
    const t = checkTrack(coords, e.name)!;
    expect(t.shape).not.toBe("point_to_point");
    expect(t.endsApartKm).toBeLessThan(1);
    expect(t.broken).toBeNull();
    expect(Math.max(...e.coordinates.map((c) => c[2]))).toBeGreaterThan(940);
  });

  it("every entry is in Spain, reported under the current road rules, and says what the ride is", () => {
    for (const e of byName.values()) {
      expect(e.country).toBe("Spain");
      expect(e.road_report.rules_version).toBe(ROAD_RULES_VERSION);
      expect(e.description).toMatch(/\d+ km/);
      expect(e.description).toContain(String(Math.round(e.distance_km)));
    }
  });
});
