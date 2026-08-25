import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "../../../middleware";

describe("protected-page login redirect", () => {
  it("preserves a rider's full route-planning question", () => {
    const response = middleware(
      new NextRequest("https://loops.ie/generate?q=2%20hours%20from%20Dublin")
    );

    const location = response.headers.get("location");
    expect(location).not.toBeNull();
    const login = new URL(location!);
    expect(login.pathname).toBe("/login");
    expect(login.searchParams.get("redirect")).toBe(
      "/generate?q=2%20hours%20from%20Dublin"
    );
  });

  it("preserves ordinary protected paths without adding a query", () => {
    const response = middleware(new NextRequest("https://loops.ie/submissions"));
    const login = new URL(response.headers.get("location")!);
    expect(login.searchParams.get("redirect")).toBe("/submissions");
  });

  it("does not redirect a signed-in rider", () => {
    const request = new NextRequest("https://loops.ie/generate?q=threshold", {
      headers: { cookie: "session=test-session" },
    });
    const response = middleware(request);
    expect(response.headers.get("location")).toBeNull();
  });
});
