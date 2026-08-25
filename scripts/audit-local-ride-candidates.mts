/**
 * Read-only audit of legacy Ireland ride files already present in the repo.
 *
 * This establishes only whether a file looks like a completed, timestamped
 * loop. It deliberately cannot grant publication rights, identify the rider,
 * create a route, or write to a database.
 *
 * Run with:
 *   npm run audit:local-candidates
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseGpx } from "../src/lib/gpx";
import { validateRecordedRideEvidence } from "../src/lib/recording-evidence";

type LegacyManifest = {
  routes: Array<{
    gpx: string;
    name: string;
    county: string;
    country: string;
    assignedUser?: string;
  }>;
};

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const dataDir = join(repoRoot, "scripts", "seed-data");
const manifest = JSON.parse(
  readFileSync(join(dataDir, "manifest.json"), "utf8")
) as LegacyManifest;

const candidates = manifest.routes
  .filter((route) => route.country === "Ireland" && route.gpx.endsWith(".gpx"))
  .map((route) => {
    const filePath = join(dataDir, "gpx", route.gpx);
    const content = readFileSync(filePath, "utf8");
    const parsed = parseGpx(content);
    const riddenAt = parsed.recorded_at_start?.slice(0, 10) ?? "";
    const recordingIssue = validateRecordedRideEvidence(parsed, riddenAt);
    const technicalEvidenceStatus = recordingIssue
      ? "failed_recording_gate"
      : "passed_recording_gate";

    return {
      file: route.gpx,
      legacy_name: route.name,
      county: route.county,
      sha256: createHash("sha256").update(content).digest("hex"),
      distance_km: Math.round(parsed.distance_km * 10) / 10,
      elevation_gain_m: Math.round(parsed.elevation_gain_m),
      point_count: parsed.coordinates.length,
      timestamped_point_count: parsed.timestamped_point_count,
      recorded_at_start: parsed.recorded_at_start,
      recorded_at_end: parsed.recorded_at_end,
      technical_evidence_status: technicalEvidenceStatus,
      technical_evidence_issue: recordingIssue,
      named_rider_status: "unconfirmed",
      publication_rights_status: "unconfirmed",
      ingestion_status: recordingIssue
        ? "blocked_technical_evidence"
        : "blocked_named_rider_and_rights",
      note:
        "The legacy manifest's assigned synthetic user is not rider evidence or publication permission.",
    };
  });

const report = {
  generated_at: new Date().toISOString(),
  mode: "read_only_no_database_writes",
  policy:
    "A technical pass is only a candidate. The named rider must personally attest the ride, rights and privacy in the staging submission workflow before LOOPS creates a route.",
  totals: {
    files_checked: candidates.length,
    passed_recording_gate: candidates.filter(
      (candidate) => candidate.technical_evidence_status === "passed_recording_gate"
    ).length,
    eligible_for_ingestion: 0,
  },
  candidates,
};

console.log(JSON.stringify(report, null, 2));
