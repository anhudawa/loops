import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

describe("ridden route submission workflow", () => {
  it("creates the route, version and attestation through the atomic submission boundary", () => {
    const endpoint = source("src/app/api/routes/route.ts");
    const database = source("src/lib/db.ts");
    expect(endpoint).toContain("createRiddenRouteSubmission");
    expect(endpoint).not.toContain("createInitialRouteProvenance");
    expect(database).toContain("WITH inserted_route AS");
    expect(database).toContain("inserted_version AS");
    expect(database).toContain("inserted_attestation AS");
  });

  it("keeps private review pages out of search and disables public route actions", () => {
    const layout = source("src/app/routes/[id]/layout.tsx");
    const page = source("src/app/routes/[id]/page.tsx");
    expect(layout).toContain("noarchive: true");
    expect(page).toContain("const isPublicRoute = route.is_verified === 1");
    expect(page).toContain("Public actions are disabled until");
  });

  it("gives contributors a private decision queue and reviewers an explicit rejection path", () => {
    const submissions = source("src/app/api/submissions/route.ts");
    const reviewEndpoint = source("src/app/api/admin/routes/[id]/route.ts");
    expect(submissions).toContain("requireAuth(request)");
    expect(reviewEndpoint).toContain("rejectRouteSubmission");
    expect(reviewEndpoint).toContain('"rejected"');
  });
});
