import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

describe("Clontarf road intelligence trust boundary", () => {
  it("keeps team-only proposals structurally outside route publication", () => {
    const migration = source("migrations/011_clontarf_road_intelligence.sql");
    expect(migration).toContain("CREATE TABLE route_plan_proposals");
    expect(migration).toContain("visibility = 'team_only'");
    expect(migration).toContain("public_eligible = FALSE");
    expect(migration).not.toMatch(/INSERT INTO routes\b/);
    expect(migration).not.toMatch(/UPDATE routes\b/);
  });

  it("requires approved exact-version ride evidence for road observations", () => {
    const migration = source("migrations/011_clontarf_road_intelligence.sql");
    expect(migration).toContain("enforce_approved_ride_edge_observation");
    expect(migration).toContain("ra.review_status = 'approved'");
    expect(migration).toContain("ra.route_version_id = NEW.route_version_id");
    expect(migration).toContain("ra.ridden_at = NEW.observed_at");
  });

  it("syncs road observations only and has no route or proposal write path", () => {
    const sync = source("scripts/sync-road-intelligence.mts");
    expect(sync).toContain("ra.review_status = 'approved'");
    expect(sync).toContain("INSERT INTO road_edges");
    expect(sync).toContain("INSERT INTO ride_edge_observations");
    expect(sync).not.toMatch(/INSERT INTO routes\b/);
    expect(sync).not.toMatch(/INSERT INTO route_plan_proposals\b/);
    expect(sync).toContain("contracted-or-self-hosted-valhalla");
  });

  it("exposes coverage as an admin read endpoint only", () => {
    const endpoint = source("src/app/api/admin/road-intelligence/route.ts");
    expect(endpoint).toContain("export async function GET");
    expect(endpoint).not.toContain("export async function POST");
    expect(endpoint).not.toContain("export async function PATCH");
    expect(endpoint).toContain("requireAdmin");
    expect(endpoint).not.toContain("supportingObservationId:");
    expect(endpoint).not.toMatch(/rider_(user_id|name)/);
  });

  it("evaluates Clontarf benchmarks without a route or proposal write path", () => {
    const evaluator = source("scripts/evaluate-clontarf-benchmarks.mts");
    const planner = source("src/lib/road-intelligence/evidence-planner.ts");
    expect(evaluator).toContain("mode: \"read_only\"");
    expect(evaluator).toContain("planEvidenceBackedLoop");
    expect(evaluator).not.toMatch(/INSERT INTO routes\b/);
    expect(evaluator).not.toMatch(/INSERT INTO route_plan_proposals\b/);
    expect(planner).not.toMatch(/@vercel\/postgres/);
    expect(planner).not.toMatch(/INSERT INTO\b/);
  });

  it("seeds demand benchmarks rather than synthetic route answers", () => {
    const migration = source("migrations/011_clontarf_road_intelligence.sql");
    expect(migration.match(/'clontarf-\d{3}-/g)).toHaveLength(12);
    expect(migration).toContain("'clontarf-240-endurance'");
    expect(migration).toContain("honest_no_match_until_covered");
  });

  it("requires an ordered evidence record for each proposed directed edge", () => {
    const migration = source("migrations/012_route_plan_edge_coverage.sql");
    expect(migration).toContain("CREATE TABLE route_plan_proposal_edges");
    expect(migration).toContain("supporting_observation_id");
    expect(migration).toContain("REFERENCES ride_edge_observations(id, road_edge_id)");
    expect(migration).toContain("human-covered proposals cannot contain provisional edges");
    expect(migration).toContain("ra.review_status = 'approved'");
  });

  it("links assessments and human-covered plans to traversed current evidence", () => {
    const migration = source("migrations/013_harden_road_evidence_links.sql");
    expect(migration).toContain("reo.road_edge_id = NEW.road_edge_id");
    expect(migration).toContain("CREATE CONSTRAINT TRIGGER human_covered_proposal_support");
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(migration).toContain("current approved evidence for every directed edge");
  });
});
