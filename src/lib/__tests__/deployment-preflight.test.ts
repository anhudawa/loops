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
});
