import { describe, it, expect } from "vitest";
import { canonicalRegion, regionSpellings, endsApartKmSql } from "../db";

describe("region names", () => {
  it("one island, one name", () => {
    for (const r of ["Majorca", "Islas Baleares", "Balearic Islands", "mallorca", " Mallorca "]) expect(canonicalRegion(r)).toBe("Mallorca");
    expect(canonicalRegion("Tipperary ")).toBe("Tipperary");
    expect(canonicalRegion("Girona")).toBe("Girona");
  });
  it("a region's stored spellings", () => {
    expect(regionSpellings("Majorca")).toEqual(expect.arrayContaining(["Mallorca", "Majorca", "Islas Baleares", "Balearic Islands"]));
    expect(regionSpellings("Girona")).toEqual(["Girona"]);
  });
});

describe("endsApartKmSql", () => {
  it("reads the first and last point from the track text (no JSON parse)", () => {
    const s = endsApartKmSql("r.coordinates");
    expect(s).toContain("left(r.coordinates, 200)");
    expect(s).toContain("right(r.coordinates, 200)");
    expect(s).not.toMatch(/::jsonb?/);
  });
});
