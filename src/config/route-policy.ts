/**
 * Commercial relaunch policy.
 *
 * These are product invariants rather than runtime feature flags. A deploy or
 * environment-variable mistake must not be able to turn freshly generated or
 * unproven geometry into a public LOOPS route.
 */
export const LAUNCH_SEQUENCE = [
  { market: "ireland", country: "Ireland", status: "active" },
  { market: "girona", country: "Spain", region: "Girona", status: "planned" },
  { market: "mallorca", country: "Spain", region: "Mallorca", status: "planned" },
] as const;

export const ACTIVE_LAUNCH_MARKET = LAUNCH_SEQUENCE[0];
export const PUBLIC_DISCIPLINE = "road" as const;
export const PUBLIC_SURFACE_TYPE = "road" as const;
export const ROUTE_FRESHNESS_DAYS = 365;
export const INTERVAL_FRESHNESS_DAYS = 180;

/**
 * The platform is provenance, not publication permission. In particular,
 * `strava_export` means a file the contributor exported from their own ride;
 * LOOPS does not ingest Strava activities or public route URLs directly.
 */
export const RIDE_SOURCE_PLATFORMS = [
  { value: "garmin", label: "Garmin" },
  { value: "ridewithgps", label: "RideWithGPS" },
  { value: "komoot", label: "Komoot" },
  { value: "wahoo", label: "Wahoo" },
  { value: "strava_export", label: "Strava file export" },
  { value: "other", label: "Other recording app or device" },
] as const;

export type RideSourcePlatform = (typeof RIDE_SOURCE_PLATFORMS)[number]["value"];

export type PlatformCapabilityStatus =
  | "allowed"
  | "partner_and_legal_review_required"
  | "unavailable"
  | "prohibited";

/**
 * Acquisition and delivery are deliberately separate capabilities. An API
 * that can read or write a route does not grant LOOPS permission to add that
 * route to its catalogue, and a planned route is not evidence of a completed
 * human ride.
 */
export const PLATFORM_INTEGRATION_POLICY: Readonly<
  Record<
    RideSourcePlatform,
    {
      ownerCompletedRideFile: PlatformCapabilityStatus;
      directPrivateActivityEvidence: PlatformCapabilityStatus;
      publicCatalogueImport: PlatformCapabilityStatus;
      outboundCourseDelivery: PlatformCapabilityStatus;
    }
  >
> = {
  garmin: {
    ownerCompletedRideFile: "allowed",
    directPrivateActivityEvidence: "partner_and_legal_review_required",
    publicCatalogueImport: "prohibited",
    outboundCourseDelivery: "partner_and_legal_review_required",
  },
  ridewithgps: {
    ownerCompletedRideFile: "allowed",
    directPrivateActivityEvidence: "partner_and_legal_review_required",
    publicCatalogueImport: "prohibited",
    outboundCourseDelivery: "partner_and_legal_review_required",
  },
  komoot: {
    ownerCompletedRideFile: "allowed",
    directPrivateActivityEvidence: "unavailable",
    publicCatalogueImport: "prohibited",
    outboundCourseDelivery: "partner_and_legal_review_required",
  },
  wahoo: {
    ownerCompletedRideFile: "allowed",
    directPrivateActivityEvidence: "partner_and_legal_review_required",
    publicCatalogueImport: "prohibited",
    outboundCourseDelivery: "partner_and_legal_review_required",
  },
  strava_export: {
    ownerCompletedRideFile: "allowed",
    directPrivateActivityEvidence: "partner_and_legal_review_required",
    publicCatalogueImport: "prohibited",
    outboundCourseDelivery: "unavailable",
  },
  other: {
    ownerCompletedRideFile: "allowed",
    directPrivateActivityEvidence: "unavailable",
    publicCatalogueImport: "prohibited",
    outboundCourseDelivery: "unavailable",
  },
};

export function isPlatformCapabilityAllowed(
  platform: RideSourcePlatform,
  capability: keyof (typeof PLATFORM_INTEGRATION_POLICY)[RideSourcePlatform]
): boolean {
  return PLATFORM_INTEGRATION_POLICY[platform][capability] === "allowed";
}

export function isRideSourcePlatform(value: string): value is RideSourcePlatform {
  return RIDE_SOURCE_PLATFORMS.some((platform) => platform.value === value);
}

export function getRideSourceLabel(value?: string | null): string | null {
  return RIDE_SOURCE_PLATFORMS.find((platform) => platform.value === value)?.label ?? null;
}

/** Consumer-facing geometry may only come from the reviewed route library. */
export const ALLOW_FRESH_PUBLIC_ROUTE_GENERATION = false;

/** Strava API data cannot be used to populate the public LOOPS library. */
export const ALLOW_STRAVA_ROUTE_IMPORT = false;

/** Arbitrary public route URLs do not establish permission to republish. */
export const ALLOW_PUBLIC_URL_ROUTE_IMPORT = false;

/**
 * The checked-in Garmin client targets a legacy OAuth flow. Keep it impossible
 * to activate until LOOPS is accepted into the current business programme and
 * the integration is rebuilt and tested against Garmin's OAuth 2 APIs.
 */
export const ALLOW_GARMIN_COURSES_INTEGRATION = false;

export const PUBLICATION_STATUSES = [
  "draft",
  "in_review",
  "published",
  "stale",
  "quarantined",
  "retired",
] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export interface PublicRouteEvidence {
  discipline?: string | null;
  surface_type?: string | null;
  country?: string | null;
  publication_status?: PublicationStatus | null;
  human_ridden?: boolean | null;
  last_ridden_at?: string | null;
  rights_confirmed_at?: string | null;
}

/**
 * Single source of truth for whether a route may be presented as a public
 * LOOPS route during the Ireland beta.
 */
export function isEligibleForPublicLibrary(
  route: PublicRouteEvidence,
  asOf: Date = new Date()
): boolean {
  const riddenAt = route.last_ridden_at
    ? new Date(`${route.last_ridden_at.slice(0, 10)}T00:00:00Z`)
    : null;
  const freshnessCutoff = new Date(asOf);
  freshnessCutoff.setUTCDate(freshnessCutoff.getUTCDate() - ROUTE_FRESHNESS_DAYS);

  return (
    route.discipline === PUBLIC_DISCIPLINE &&
    route.surface_type === PUBLIC_SURFACE_TYPE &&
    route.country === ACTIVE_LAUNCH_MARKET.country &&
    route.publication_status === "published" &&
    route.human_ridden === true &&
    Boolean(riddenAt && !Number.isNaN(riddenAt.getTime()) && riddenAt >= freshnessCutoff) &&
    Boolean(route.rights_confirmed_at)
  );
}
