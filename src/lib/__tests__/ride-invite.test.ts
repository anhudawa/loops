import { describe, it, expect } from "vitest";
import { parseRideTime, formatRideWhen, cleanMeet, rideUrl } from "@/lib/ride-invite";

describe("ride invite", () => {
  it("formats the wall-clock time exactly as typed, with the right weekday", () => {
    expect(formatRideWhen("2026-09-26T09:00")).toBe("Sat 26 Sep · 9:00");
    expect(formatRideWhen("2026-12-31T18:30")).toBe("Thu 31 Dec · 18:30");
  });
  it("rejects malformed or impossible times (no 'Invalid Date' ever reaches a message)", () => {
    expect(parseRideTime("")).toBeNull();
    expect(parseRideTime("2026-02-31T09:00")).toBeNull();
    expect(parseRideTime("26/09/2026 9am")).toBeNull();
    expect(formatRideWhen(null)).toBeNull();
  });
  it("cleans the meeting point", () => {
    expect(cleanMeet("  Clontarf Rd,\n Bull Wall <b> ")).toBe("Clontarf Rd, Bull Wall b");
    expect(cleanMeet("   ")).toBeNull();
  });
  it("builds a ride link carrying time and meeting point", () => {
    expect(rideUrl("https://www.loops.ie", "abc", "2026-09-26T09:00", "Clontarf Rd"))
      .toBe("https://www.loops.ie/ride/abc?t=2026-09-26T09%3A00&m=Clontarf+Rd");
    expect(rideUrl("https://www.loops.ie", "abc", "bad", null)).toBe("https://www.loops.ie/ride/abc");
  });
});
