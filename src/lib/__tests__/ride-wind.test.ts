import { describe, it, expect } from "vitest";
import { rideVerdict, nextRidingHour, type ForecastHour } from "../ride-wind";

// A rectangle loop ridden clockwise: 20 km north, 10 km east, 20 km south, 10 km west.
function loop(): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 100; i++) pts.push([53 + (i / 100) * 0.18, -6.2]);          // north ~20 km
  for (let i = 1; i <= 50; i++) pts.push([53.18, -6.2 + (i / 50) * 0.15]);         // east ~10 km
  for (let i = 1; i <= 100; i++) pts.push([53.18 - (i / 100) * 0.18, -6.05]);      // south ~20 km
  for (let i = 1; i <= 50; i++) pts.push([53, -6.05 - (i / 50) * 0.15]);           // west ~10 km
  return pts;
}
const hour = (h: number, over: Partial<ForecastHour> = {}): ForecastHour => ({
  time: `2026-09-26T${String(h).padStart(2, "0")}:00`, temperature: 14, precipitation: 0,
  precipitationProbability: 5, windSpeed: 20, windDirection: 0, windGusts: 30, weatherCode: 2, ...over,
});

describe("rideVerdict", () => {
  it("north wind: into it going north, at your back coming home", () => {
    const v = rideVerdict(loop(), [hour(9), hour(10), hour(11)])!;
    expect(v.headline).toMatch(/into it on the way out, at your back coming home/);
    expect(v.detail).toBe("Dry for the ride.");
  });
  it("south wind: honest about the headwind home, never suggests reversing", () => {
    const v = rideVerdict(loop(), [hour(9, { windDirection: 180 }), hour(10, { windDirection: 180 })])!;
    expect(v.headline).toMatch(/save something for the finish/);
    expect(v.headline).not.toMatch(/other way/);
    expect(v.out_alignment).toBeGreaterThan(0.12);
    expect(v.home_alignment).toBeLessThan(-0.12);
  });
  it("light wind: says it is not worth planning around", () => {
    const v = rideVerdict(loop(), [hour(9, { windSpeed: 5 }), hour(10, { windSpeed: 6 })])!;
    expect(v.light).toBe(true);
    expect(v.headline).toMatch(/not worth planning around/);
  });
  it("uses the wind for the hour you reach each stretch", () => {
    // Wind flips at 10:00 from south (tailwind going north) to north (tailwind going south).
    // 20 km/h: north leg in hour 0 (tailwind), south leg in hours 1–2 (tailwind too).
    const v = rideVerdict(loop(), [hour(9, { windDirection: 180 }), hour(10, { windDirection: 0 }), hour(11, { windDirection: 0 })], 20)!;
    expect(v.tailwind_km).toBeGreaterThan(30);
    expect(v.headwind_km).toBeLessThan(5);
  });
  it("flags rain and gusts in the ride window", () => {
    const v = rideVerdict(loop(), [hour(9), hour(10, { precipitationProbability: 70, precipitation: 1.2, windGusts: 55 })])!;
    expect(v.detail).toMatch(/Rain likely around 10:00 \(70%\)/);
    expect(v.detail).toMatch(/Gusts to 55 km\/h/);
  });
});

describe("nextRidingHour (no ride time picked)", () => {
  it("daytime: plans for now", () => {
    expect(nextRidingHour("2026-09-25T06:00")).toBeNull();
    expect(nextRidingHour("2026-09-25T13:45")).toBeNull();
    expect(nextRidingHour("2026-09-25T19:59")).toBeNull();
  });
  it("small hours: this morning at 8:00, not a 2 am ride", () => {
    expect(nextRidingHour("2026-09-25T02:15")).toEqual({ hour: "2026-09-25T08:00", label: "This morning · 8:00" });
  });
  it("late evening: tomorrow at 8:00, across a month end", () => {
    expect(nextRidingHour("2026-09-30T21:10")).toEqual({ hour: "2026-10-01T08:00", label: "Tomorrow · 8:00" });
    expect(nextRidingHour("2026-12-31T23:00")?.hour).toBe("2027-01-01T08:00");
  });
  it("no clock: no plan", () => {
    expect(nextRidingHour(undefined)).toBeNull();
    expect(nextRidingHour("garbage")).toBeNull();
  });
});
