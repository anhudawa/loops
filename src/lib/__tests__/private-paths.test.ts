import { describe, it, expect } from "vitest";
import { gateHeading, isPrivatePath } from "@/app/login/private-paths";

describe("isPrivatePath", () => {
  it("gates the signed-in pages", () => {
    for (const p of ["/generate", "/generate?q=80km", "/upload", "/messages/abc", "/profile", "/profile/42", "/admin"]) {
      expect(isPrivatePath(p)).toBe(true);
    }
  });

  it("leaves public pages, the planner and unknown URLs alone", () => {
    for (const p of ["/", "/plan", "/login", "/routes/1", "/ride/1", "/cycling/girona", "/pricing", "/nope-404", "/generated", "/profiles"]) {
      expect(isPrivatePath(p)).toBe(false);
    }
  });
});

describe("gateHeading", () => {
  it("never says welcome back to someone sent by the gate", () => {
    expect(gateHeading("/generate?q=3%20hours")).toBe("Log in to plan a ride");
    expect(gateHeading("/upload")).toBe("Log in to upload a route");
    expect(gateHeading("/admin")).toBe("Log in to continue");
  });

  it("is null for public pages (a plain Log in tap)", () => {
    expect(gateHeading("/")).toBeNull();
    expect(gateHeading("/routes/abc")).toBeNull();
  });
});
