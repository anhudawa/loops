import { describe, it, expect } from "vitest";
import { buildRouteGpx, sanitizeMeetingPoint, parseGpx } from "../gpx";

const coords = [
  [53.363544, -6.179867, 5],
  [53.37, -6.18, 8],
  [53.38, -6.19],
];

describe("buildRouteGpx", () => {
  it("adds a Start waypoint at the first point", () => {
    const xml = buildRouteGpx("Spin", null, coords);
    expect(xml).toContain('<wpt lat="53.363544" lon="-6.179867"><ele>5</ele><name>Start</name>');
    // The track itself is unchanged and still parses.
    expect(parseGpx(xml).coordinates).toHaveLength(3);
  });

  it("names the start with an escaped meeting point", () => {
    const xml = buildRouteGpx("Spin", null, coords, { meetingPoint: "Clontarf Rd & <Bull> Wall\n" });
    expect(xml).toContain("<name>Start: Clontarf Rd &amp; &lt;Bull&gt; Wall</name>");
    expect(xml).toContain("<desc>Meeting point: Clontarf Rd &amp; &lt;Bull&gt; Wall</desc>");
    expect(xml).not.toContain("<Bull>");
  });

  it("omits the waypoint for an empty track", () => {
    expect(buildRouteGpx("Spin", null, [])).not.toContain("<wpt");
  });
});

describe("sanitizeMeetingPoint", () => {
  it("strips control chars, collapses space, caps length", () => {
    expect(sanitizeMeetingPoint("  a\u0000\tb  ")).toBe("a b");
    expect(sanitizeMeetingPoint("   ")).toBeNull();
    expect(sanitizeMeetingPoint(null)).toBeNull();
    expect(sanitizeMeetingPoint("x".repeat(200))!.length).toBe(80);
  });
});
