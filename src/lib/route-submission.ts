import { createHash } from "node:crypto";
import {
  MAX_ROUTE_FILE_SIZE,
  VALID_ROUTE_EXTENSIONS,
} from "@/config/constants";
import {
  ALLOW_PUBLIC_URL_ROUTE_IMPORT,
  ALLOW_STRAVA_ROUTE_IMPORT,
  isRideSourcePlatform,
  type RideSourcePlatform,
} from "@/config/route-policy";
import { parseRouteFile } from "@/lib/route-parser";
import { validateRecordedRideEvidence } from "@/lib/recording-evidence";

export class RouteSubmissionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "RouteSubmissionError";
  }
}

export interface PreparedRideSubmission {
  routeFileName: string;
  riddenAt: string;
  sourcePlatform: RideSourcePlatform;
  sourceReference: string | null;
  evidenceType: "gpx" | "fit" | "tcx";
  evidenceFileHash: string;
  evidenceStartedAt: string;
  evidenceEndedAt: string;
  evidencePointCount: number;
  evidenceTimestampedPointCount: number;
  coordinates: string;
  coordinatePairs: [number, number][];
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
}

function fail(message: string, code: string, status = 400): never {
  throw new RouteSubmissionError(message, code, status);
}

/**
 * Shared evidence boundary for initial submissions and later ridden versions.
 * Platform links are context only; geometry must come from a timestamped file
 * exported by the contributor from a ride they personally completed.
 */
export async function prepareRideSubmission(
  formData: FormData
): Promise<PreparedRideSubmission> {
  if (
    formData.get("ridden_by_submitter") !== "true" ||
    formData.get("rights_confirmed") !== "true" ||
    formData.get("privacy_confirmed") !== "true"
  ) {
    fail(
      "Confirm that you rode this route, can contribute the recording, and have checked the public start and finish for sensitive locations.",
      "RIDE_ATTESTATION_REQUIRED"
    );
  }

  const riddenAtValue = formData.get("ridden_at");
  const riddenAt = typeof riddenAtValue === "string" ? riddenAtValue : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(riddenAt)) {
    fail("Enter the date you rode this route.", "RIDE_DATE_REQUIRED");
  }
  const riddenDate = new Date(`${riddenAt}T00:00:00Z`);
  if (Number.isNaN(riddenDate.getTime()) || riddenDate.getTime() > Date.now()) {
    fail("The ridden date must be a valid date in the past.", "INVALID_RIDE_DATE");
  }

  const sourcePlatformValue = formData.get("source_platform");
  if (
    typeof sourcePlatformValue !== "string" ||
    !isRideSourcePlatform(sourcePlatformValue)
  ) {
    fail("Select where the uploaded ride recording came from.", "RIDE_SOURCE_REQUIRED");
  }
  const sourcePlatform = sourcePlatformValue;

  const sourceReferenceValue = formData.get("source_reference");
  const sourceReference = typeof sourceReferenceValue === "string" && sourceReferenceValue.trim()
    ? sourceReferenceValue.trim()
    : null;
  if (sourceReference && sourceReference.length > 500) {
    fail("The source reference must be 500 characters or less.", "VALIDATION_ERROR");
  }

  if (formData.get("strava_activity_id")) {
    if (!ALLOW_STRAVA_ROUTE_IMPORT) {
      fail(
        "Direct Strava importing is unavailable. Export your own GPX, FIT, or TCX recording and upload the file for human review.",
        "STRAVA_IMPORT_DISABLED",
        410
      );
    }
    fail("Strava route importing is unavailable.", "STRAVA_IMPORT_DISABLED", 410);
  }
  if (formData.get("url")) {
    if (!ALLOW_PUBLIC_URL_ROUTE_IMPORT) {
      fail(
        "Public route URL importing is unavailable because a public link does not establish permission to republish. Upload your own completed ride file instead.",
        "PUBLIC_URL_IMPORT_DISABLED",
        410
      );
    }
    fail("Public route URL importing is unavailable.", "PUBLIC_URL_IMPORT_DISABLED", 410);
  }

  const routeFileValue = formData.get("route_file") || formData.get("gpx");
  if (!(routeFileValue instanceof File)) {
    fail("Upload the GPX, FIT, or TCX file from a ride you completed.", "VALIDATION_ERROR");
  }
  const routeFile = routeFileValue;
  if (routeFile.size > MAX_ROUTE_FILE_SIZE) {
    fail("File must be under 10MB", "VALIDATION_ERROR");
  }

  const filename = routeFile.name.toLowerCase();
  if (!VALID_ROUTE_EXTENSIONS.some((extension) => filename.endsWith(extension))) {
    fail("Unsupported file type. Upload a .gpx, .fit, or .tcx file", "VALIDATION_ERROR");
  }

  let content: string | ArrayBuffer;
  let evidenceFileHash: string;
  if (filename.endsWith(".fit")) {
    content = await routeFile.arrayBuffer();
    evidenceFileHash = createHash("sha256").update(Buffer.from(content)).digest("hex");
  } else {
    content = await routeFile.text();
    evidenceFileHash = createHash("sha256").update(content).digest("hex");
    if (filename.endsWith(".gpx") && !content.includes("<gpx")) {
      fail("Invalid GPX file: missing <gpx> root element", "VALIDATION_ERROR");
    }
    if (filename.endsWith(".tcx") && !content.includes("<TrainingCenterDatabase")) {
      fail("Invalid TCX file: missing <TrainingCenterDatabase> root element", "VALIDATION_ERROR");
    }
  }

  const parsed = await parseRouteFile(routeFile.name, content);
  if (parsed.coordinates.length === 0) {
    fail("No track points found in the uploaded file", "VALIDATION_ERROR");
  }
  const evidenceError = validateRecordedRideEvidence(parsed, riddenAt);
  if (evidenceError) fail(evidenceError, "RECORDED_RIDE_REQUIRED");

  const coordinates = parsed.coordinates.map((coordinate, index) => [
    coordinate[0],
    coordinate[1],
    Math.round((parsed.elevations[index] ?? 0) * 10) / 10,
  ]);
  const evidenceType = filename.endsWith(".fit")
    ? "fit"
    : filename.endsWith(".tcx")
      ? "tcx"
      : "gpx";

  return {
    routeFileName: routeFile.name,
    riddenAt,
    sourcePlatform,
    sourceReference,
    evidenceType,
    evidenceFileHash,
    evidenceStartedAt: parsed.recorded_at_start!,
    evidenceEndedAt: parsed.recorded_at_end!,
    evidencePointCount: parsed.coordinates.length,
    evidenceTimestampedPointCount: parsed.timestamped_point_count,
    coordinates: JSON.stringify(coordinates),
    coordinatePairs: parsed.coordinates,
    distanceKm: parsed.distance_km,
    elevationGainM: parsed.elevation_gain_m,
    elevationLossM: parsed.elevation_loss_m,
  };
}
