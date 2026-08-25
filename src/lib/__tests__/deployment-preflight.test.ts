import { describe, expect, it } from "vitest";
import { evaluateDeploymentPreflight } from "@/lib/deployment-preflight";

const baseEnvironment = {
  LOOPS_DEPLOYMENT_ENV: "staging",
  LOOPS_DATABASE_TARGET: "staging",
  LOOPS_EXPECTED_DATABASE_HOST: "staging.db.example",
  LOOPS_EXPECTED_DATABASE_NAME: "loops_staging",
  POSTGRES_URL: "postgresql://user:secret@staging.db.example/loops_staging",
  POSTGRES_URL_NON_POOLING: "postgresql://user:secret@staging.db.example/loops_staging",
  LOOPS_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  NEXT_PUBLIC_BASE_URL: "https://staging.loops.ie",
  NEXT_PUBLIC_MAP_TILE_URL: "https://tiles.example/{z}/{x}/{y}.png",
  NEXT_PUBLIC_MAP_ATTRIBUTION: "© OpenStreetMap contributors · Example Maps",
  LOOPS_MAP_USAGE_MODE: "internal_r_and_d",
  LOOPS_ACCESS_MODE: "team_sso",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
};

describe("deployment preflight", () => {
  it("accepts a complete staging environment", () => {
    expect(evaluateDeploymentPreflight(baseEnvironment).passed).toBe(true);
  });

  it("rejects a target mismatch and disabled integration credentials", () => {
    const result = evaluateDeploymentPreflight({
      ...baseEnvironment,
      LOOPS_DATABASE_TARGET: "production",
      STRAVA_CLIENT_SECRET: "must-not-be-here",
    });
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("exactly match");
    expect(result.failures.join(" ")).toContain("Strava/Garmin");
  });

  it("requires legal and alert sign-off for production", () => {
    const result = evaluateDeploymentPreflight({
      ...baseEnvironment,
      LOOPS_DEPLOYMENT_ENV: "production",
      LOOPS_DATABASE_TARGET: "production",
    });
    expect(result.failures.join(" ")).toContain("legal sign-off");
    expect(result.failures.join(" ")).toContain("monitoring provider");
  });

  it("never permits synthetic seed mode", () => {
    expect(evaluateDeploymentPreflight({
      ...baseEnvironment,
      LOOPS_ALLOW_SYNTHETIC_SEED: "true",
    }).passed).toBe(false);
  });

  it("rejects internal R&D maps without team SSO", () => {
    const result = evaluateDeploymentPreflight({
      ...baseEnvironment,
      LOOPS_ACCESS_MODE: "public",
    });
    expect(result.failures.join(" ")).toContain("team_sso");
  });

  it("requires the linked MapTiler logo on the Free staging plan", () => {
    const result = evaluateDeploymentPreflight({
      ...baseEnvironment,
      NEXT_PUBLIC_MAP_TILE_URL: "https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=test",
      NEXT_PUBLIC_MAP_ATTRIBUTION: "© MapTiler · © OpenStreetMap contributors",
    });
    expect(result.failures.join(" ")).toContain("linked MapTiler logo");
  });

  it("rejects internal R&D map usage in production", () => {
    const result = evaluateDeploymentPreflight({
      ...baseEnvironment,
      LOOPS_DEPLOYMENT_ENV: "production",
      LOOPS_DATABASE_TARGET: "production",
      LOOPS_LEGAL_REVIEWED_AT: "2026-08-25",
      LOOPS_MONITORING_PROVIDER: "test",
      LOOPS_MONITORING_ALERTS_VERIFIED_AT: "2026-08-25",
    });
    expect(result.failures.join(" ")).toContain("allowed only in staging");
    expect(result.failures.join(" ")).toContain("requires LOOPS_MAP_USAGE_MODE=commercial");
  });
});
