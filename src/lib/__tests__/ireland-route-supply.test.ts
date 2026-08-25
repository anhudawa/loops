import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const trackerPath = new URL(
  "../../../docs/relaunch/IRELAND_ROUTE_SUPPLY_TRACKER.csv",
  import.meta.url
);

function trackerRows(): Record<string, string>[] {
  const [header, ...lines] = readFileSync(trackerPath, "utf8").trim().split("\n");
  const columns = header.split(",");
  return lines.map((line) => Object.fromEntries(
    line.split(",").map((value, index) => [columns[index], value])
  ));
}

describe("Ireland route supply allocation", () => {
  it("allocates 35 unique route targets", () => {
    const rows = trackerRows();
    expect(rows).toHaveLength(35);
    expect(new Set(rows.map((row) => row.target_id)).size).toBe(35);
  });

  it("covers every beta distance band and supported workout type", () => {
    const rows = trackerRows();
    expect(new Set(rows.map((row) => row.distance_band))).toEqual(
      new Set(["short", "medium", "long"])
    );
    expect(new Set(rows.map((row) => row.session_priority))).toEqual(
      new Set(["endurance", "tempo", "sweet_spot", "threshold"])
    );
  });

  it("starts with no invented or pre-approved supply", () => {
    expect(trackerRows().every((row) =>
      row.contributor_status === "unassigned" &&
      row.ride_file_status === "missing" &&
      row.curator_status === "not_started" &&
      row.published_route_id === ""
    )).toBe(true);
  });
});
