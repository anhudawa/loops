import { describe, expect, it } from "vitest";
import {
  prepareRideSubmission,
  RouteSubmissionError,
} from "@/lib/route-submission";

const points = Array.from({ length: 21 }, (_, index) => {
  const angle = (index / 20) * Math.PI * 2;
  const lat = 53.25 + Math.sin(angle) * 0.01;
  const lng = -6.25 + Math.cos(angle) * 0.01;
  const time = new Date(Date.UTC(2026, 7, 20, 9, index)).toISOString();
  return `<trkpt lat="${lat}" lon="${lng}"><ele>${100 + index}</ele><time>${time}</time></trkpt>`;
}).join("");

const recordedGpx = `<gpx><trk><name>Recorded loop</name><trkseg>${points}</trkseg></trk></gpx>`;

function form(fileContent = recordedGpx): FormData {
  const data = new FormData();
  data.append("route_file", new File([fileContent], "recorded-loop.gpx", { type: "application/gpx+xml" }));
  data.append("ridden_at", "2026-08-20");
  data.append("source_platform", "ridewithgps");
  data.append("source_reference", "private-activity-123");
  data.append("ridden_by_submitter", "true");
  data.append("rights_confirmed", "true");
  data.append("privacy_confirmed", "true");
  return data;
}

describe("shared route submission evidence boundary", () => {
  it("prepares a timestamped, closed recording for immutable storage", async () => {
    const prepared = await prepareRideSubmission(form());
    expect(prepared.evidenceType).toBe("gpx");
    expect(prepared.routeFileName).toBe("ridden-route.gpx");
    expect(prepared.routeFileName).not.toContain("recorded-loop");
    expect(prepared.sourcePlatform).toBe("ridewithgps");
    expect(prepared.evidencePointCount).toBe(21);
    expect(prepared.evidenceTimestampedPointCount).toBe(21);
    expect(prepared.evidenceFileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(prepared.coordinates)).toHaveLength(21);
  });

  it("requires the rider, rights and privacy declarations", async () => {
    const data = form();
    data.set("rights_confirmed", "false");
    await expect(prepareRideSubmission(data)).rejects.toMatchObject({
      name: "RouteSubmissionError",
      code: "RIDE_ATTESTATION_REQUIRED",
    } satisfies Partial<RouteSubmissionError>);
  });

  it("rejects route-only GPX geometry without recorded timestamps", async () => {
    const routePoints = Array.from({ length: 21 }, (_, index) =>
      `<rtept lat="${53.25 + index * 0.0001}" lon="${-6.25 - index * 0.0001}"><ele>100</ele></rtept>`
    ).join("");
    await expect(prepareRideSubmission(form(`<gpx><rte>${routePoints}</rte></gpx>`))).rejects.toMatchObject({
      code: "RECORDED_RIDE_REQUIRED",
    });
  });

  it("never treats a public platform URL as publication permission", async () => {
    const data = form();
    data.set("url", "https://example.test/public-route");
    await expect(prepareRideSubmission(data)).rejects.toMatchObject({
      code: "PUBLIC_URL_IMPORT_DISABLED",
      status: 410,
    });
  });
});
