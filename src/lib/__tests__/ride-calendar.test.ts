import { describe, it, expect } from "vitest";
import { rideCalendar } from "@/lib/ride-invite";

describe("rideCalendar", () => {
  const base = { routeId: "6565324e-8187-4cbd-ad69-f612cdd01d90", name: "Roadman Group Spin", minutes: 210, url: "https://www.loops.ie/ride/x?t=2026-09-26T09:00", details: "83 km", now: new Date(Date.UTC(2026, 8, 25, 12)) };
  it("is floating local time (9:00 stays 9:00) with the ride's length", () => {
    const ics = rideCalendar({ ...base, t: "2026-09-26T09:00", meet: "Clontarf Rd" })!;
    expect(ics).toContain("DTSTART:20260926T090000\r\n");
    expect(ics).toContain("DTEND:20260926T123000\r\n");
    expect(ics).toContain("LOCATION:Clontarf Rd");
    expect(ics).not.toMatch(/DTSTART:[^\r]*Z/);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });
  it("escapes text and folds long lines at 75 octets", () => {
    const ics = rideCalendar({ ...base, t: "2026-09-26T09:00", meet: "Café, the pier; north side", name: "A very long ride name that goes on and on 🚴 past the fold point for sure" })!;
    expect(ics).toContain(String.raw`Café\, the pier\; north side`);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it("crosses midnight and refuses a bad time", () => {
    expect(rideCalendar({ ...base, t: "2026-09-26T22:00", meet: null })).toContain("DTEND:20260927T013000");
    expect(rideCalendar({ ...base, t: "tomorrow", meet: null })).toBeNull();
  });
});
