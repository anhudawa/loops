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

describe("safeRedirectPath: tricks from the security audit", () => {
  it("rejects backslash and tab variants that resolve off-site", () => {
    for (const bad of ["/\\evil.example", "/\t/evil.example", decodeURIComponent("%2F%09%2Fevil.example"), "/%5Cevil".replace("%5C", "\\")]) {
      expect(safeRedirectPath(bad)).toBeNull();
    }
    expect(new URL(safeRedirectPath("/ride/abc?t=1") ?? "/", "https://www.loops.ie").host).toBe("www.loops.ie");
  });
});
