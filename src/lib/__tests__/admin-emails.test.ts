import { afterEach, describe, expect, it } from "vitest";
import { isAdminEmail } from "@/lib/admin";

describe("isAdminEmail (ADMIN_EMAILS allowlist)", () => {
  const prev = process.env.ADMIN_EMAILS;
  afterEach(() => { process.env.ADMIN_EMAILS = prev; });
  it("matches listed emails, case-insensitively, and nothing else", () => {
    process.env.ADMIN_EMAILS = " Anthony@RoadmanCycling.com, ted@example.com ";
    expect(isAdminEmail("anthony@roadmancycling.com")).toBe(true);
    expect(isAdminEmail("TED@example.com")).toBe(true);
    expect(isAdminEmail("sarah@example.com")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
  it("is off when unset", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail("anthony@roadmancycling.com")).toBe(false);
  });
});
