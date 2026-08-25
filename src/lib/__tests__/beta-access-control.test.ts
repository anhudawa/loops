import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

describe("closed-beta access control", () => {
  it("grants product access only to active memberships", () => {
    const intake = source("src/lib/beta-intake.ts");
    expect(intake).toContain("AND status = 'active'");
    expect(intake).toContain("beta_membership_events");
    expect(intake).toContain("setBetaMembershipStatus");
  });

  it("requires an administrator and a recorded reason for membership changes", () => {
    const endpoint = source("src/app/api/admin/beta-memberships/[userId]/route.ts");
    expect(endpoint).toContain("requireAdmin(request)");
    expect(endpoint).toContain("reason.length < 10");
  });

  it("shows paused or removed riders an explicit access state", () => {
    const page = source("src/app/beta/page.tsx");
    expect(page).toContain('intake.membership.status !== "active"');
    expect(page).toContain("Route matching, GPX access and contributor uploads are disabled");
  });
});
