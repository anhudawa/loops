import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

describe("source candidate isolation", () => {
  it("keeps source leads out of the route geometry and publication model", () => {
    const migration = source("migrations/009_route_source_candidates.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS route_source_candidates");
    expect(migration).not.toMatch(/\bcoordinates\b\s+(JSON|JSONB|TEXT)/i);
    expect(migration).not.toMatch(/\bgpx\b\s+(JSON|JSONB|TEXT|BYTEA)/i);
    expect(migration).toContain("verification_status = 'independently_reviewed'");
    expect(migration).toContain("rights_status = 'granted'");
    expect(migration).toContain("rider_status = 'confirmed'");
  });

  it("has an admin read endpoint but no candidate promotion endpoint", () => {
    const endpoint = source("src/app/api/admin/source-candidates/route.ts");
    expect(endpoint).toContain("export async function GET");
    expect(endpoint).not.toContain("export async function POST");
    expect(endpoint).not.toContain("export async function PATCH");
  });

  it("syncs only candidate records and never inserts routes", () => {
    const sync = source("scripts/sync-route-source-candidates.mts");
    expect(sync).toContain("INSERT INTO route_source_candidates");
    expect(sync).not.toMatch(/INSERT INTO routes\b/);
    expect(sync).toContain('target !== "staging"');
    expect(sync).toContain("expected at least 300 candidates");
  });

  it("separates source validation from named-rider verification", () => {
    const migration = source("migrations/010_expand_route_source_destinations.sql");
    expect(migration).toContain("source_validation_status");
    expect(migration).toContain("publisher_claims_ridden");
    expect(migration).toContain("no named-rider evidence or publication rights established");
    expect(migration).not.toContain("UPDATE routes");
  });
});
