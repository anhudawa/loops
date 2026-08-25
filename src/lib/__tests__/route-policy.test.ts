import { describe, expect, it } from "vitest";
import {
  ACTIVE_LAUNCH_MARKET,
  ALLOW_FRESH_PUBLIC_ROUTE_GENERATION,
  ALLOW_GARMIN_COURSES_INTEGRATION,
  ALLOW_PUBLIC_URL_ROUTE_IMPORT,
  ALLOW_STRAVA_ROUTE_IMPORT,
  PLATFORM_INTEGRATION_POLICY,
  RIDE_SOURCE_PLATFORMS,
  getRideSourceLabel,
  isRideSourcePlatform,
  isPlatformCapabilityAllowed,
  isEligibleForPublicLibrary,
} from "@/config/route-policy";

const eligibleRoute = {
  discipline: "road",
  surface_type: "road",
  country: "Ireland",
  publication_status: "published" as const,
  human_ridden: true,
  last_ridden_at: "2026-08-20",
  rights_confirmed_at: "2026-08-20T12:00:00Z",
};

describe("commercial relaunch route policy", () => {
  const asOf = new Date("2026-08-25T00:00:00Z");
  it("launches in Ireland", () => {
    expect(ACTIVE_LAUNCH_MARKET.market).toBe("ireland");
  });

  it("cannot enable unproven public route sources", () => {
    expect(ALLOW_FRESH_PUBLIC_ROUTE_GENERATION).toBe(false);
    expect(ALLOW_STRAVA_ROUTE_IMPORT).toBe(false);
    expect(ALLOW_PUBLIC_URL_ROUTE_IMPORT).toBe(false);
    expect(ALLOW_GARMIN_COURSES_INTEGRATION).toBe(false);
  });

  it("accepts a published human-ridden Irish road route with rights", () => {
    expect(isEligibleForPublicLibrary(eligibleRoute, asOf)).toBe(true);
  });

  it.each([
    ["not ridden", { human_ridden: false }],
    ["missing ride date", { last_ridden_at: null }],
    ["missing rights", { rights_confirmed_at: null }],
    ["still in review", { publication_status: "in_review" as const }],
    ["wrong discipline", { discipline: "gravel" }],
    ["unpaved surface", { surface_type: "mixed" }],
    ["future market", { country: "Spain" }],
  ])("rejects %s", (_label, change) => {
    expect(isEligibleForPublicLibrary({ ...eligibleRoute, ...change }, asOf)).toBe(false);
  });

  it("rejects ride evidence older than the freshness window", () => {
    expect(
      isEligibleForPublicLibrary(
        { ...eligibleRoute, last_ridden_at: "2025-08-20" },
        asOf
      )
    ).toBe(false);
  });

  it("accepts only the declared rider-file provenance sources", () => {
    expect(isRideSourcePlatform("ridewithgps")).toBe(true);
    expect(isRideSourcePlatform("strava_export")).toBe(true);
    expect(isRideSourcePlatform("strava_api")).toBe(false);
    expect(getRideSourceLabel("strava_export")).toBe("Strava file export");
  });

  it("keeps platform APIs separate from rider-owned file evidence", () => {
    for (const platform of RIDE_SOURCE_PLATFORMS) {
      expect(isPlatformCapabilityAllowed(platform.value, "ownerCompletedRideFile")).toBe(true);
      expect(isPlatformCapabilityAllowed(platform.value, "directPrivateActivityEvidence")).toBe(false);
      expect(PLATFORM_INTEGRATION_POLICY[platform.value].publicCatalogueImport).toBe("prohibited");
    }
  });

  it("requires approval before every supported device-delivery integration", () => {
    expect(PLATFORM_INTEGRATION_POLICY.garmin.outboundCourseDelivery).toBe(
      "partner_and_legal_review_required"
    );
    expect(PLATFORM_INTEGRATION_POLICY.ridewithgps.outboundCourseDelivery).toBe(
      "partner_and_legal_review_required"
    );
    expect(PLATFORM_INTEGRATION_POLICY.komoot.outboundCourseDelivery).toBe(
      "partner_and_legal_review_required"
    );
    expect(PLATFORM_INTEGRATION_POLICY.wahoo.outboundCourseDelivery).toBe(
      "partner_and_legal_review_required"
    );
  });
});
