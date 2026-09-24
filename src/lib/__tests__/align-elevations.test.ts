import { describe, it, expect } from "vitest";
import { alignElevations, parseGpx } from "@/lib/gpx";

describe("alignElevations", () => {
  it("keeps one height per point, filling gaps from the nearest known", () => {
    expect(alignElevations([null, 10, null, 12])).toEqual([10, 10, 10, 12]);
  });
  it("gives [] when no point has a height", () => {
    expect(alignElevations([null, null])).toEqual([]);
  });
  it("GPX with a missing <ele> stays in step with the track", () => {
    const xml = `<gpx><trk><trkseg>
      <trkpt lat="53.3" lon="-6.2"><ele>5</ele></trkpt>
      <trkpt lat="53.31" lon="-6.2"></trkpt>
      <trkpt lat="53.32" lon="-6.2"><ele>40</ele></trkpt>
    </trkseg></trk></gpx>`;
    const d = parseGpx(xml);
    expect(d.elevations).toEqual([5, 5, 40]);
    expect(d.elevations.length).toBe(d.coordinates.length);
  });
});
