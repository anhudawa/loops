import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toPublicRoute } from "@/lib/public-route";

function source(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

describe("public profile privacy", () => {
  it("never returns an account email, role or private speed setting", () => {
    const endpoint = source("src/app/api/users/[id]/route.ts");

    expect(endpoint).not.toContain("email: user.email");
    expect(endpoint).not.toContain("role: user.role");
    expect(endpoint).not.toContain("avg_speed_kmh: user.avg_speed_kmh");
  });

  it("loads saved and downloaded routes only for the account owner", () => {
    const endpoint = source("src/app/api/users/[id]/route.ts");

    expect(endpoint).toContain("const isOwner = viewer?.id === id");
    expect(endpoint).toContain("isOwner ? getUserDownloads(id) : Promise.resolve([])");
    expect(endpoint).toContain("isOwner ? getUserFavourites(id) : Promise.resolve([])");
  });

  it("does not reconstruct a public display name from an email address", () => {
    const profile = source("src/app/profile/[id]/page.tsx");

    expect(profile).not.toContain("profile.email");
    expect(profile).toContain('profile.name?.trim() || "LOOPS rider"');
  });

  it("does not attach account emails to public route comments", () => {
    const database = source("src/lib/db.ts");
    const comments = source("src/components/Comments.tsx");

    expect(database).not.toContain(
      "u.email as user_email, u.avatar_url as user_avatar"
    );
    expect(comments).not.toContain("user_email");
    expect(comments).toContain('comment.user_name?.trim() || "LOOPS rider"');
  });

  it("removes recording filenames and legacy activity identifiers from public route JSON", () => {
    const serializer = source("src/lib/public-route.ts");
    const routeEndpoint = source("src/app/api/routes/[id]/route.ts");
    const listEndpoint = source("src/app/api/routes/route.ts");

    expect(serializer).toContain('"gpx_filename"');
    expect(serializer).toContain('"strava_activity_id"');
    expect(routeEndpoint).toContain("toPublicRoute(route)");
    expect(listEndpoint).toContain("toPublicRoutes(routes)");

    expect(toPublicRoute({
      id: "route-1",
      name: "Reviewed loop",
      gpx_filename: "Rider Name 123.gpx",
      strava_activity_id: 987654,
    })).toEqual({ id: "route-1", name: "Reviewed loop" });
  });
});
