import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "../safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps a ride link with its query", () => {
    const p = "/ride/abc?t=2026-09-26T09:00&m=Clontarf%20Rd";
    expect(safeRedirectPath(p)).toBe(p);
  });
  it("rejects off-site and malformed targets", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil", "", null, 42, "/a\nb", "/" + "x".repeat(600)]) {
      expect(safeRedirectPath(bad)).toBeNull();
    }
  });
});
