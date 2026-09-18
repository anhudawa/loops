import { describe, it, expect } from "vitest";
import {
  ANALYTICS_EVENTS,
  windowFor,
  deltaPct,
  computeUsageMetrics,
  type RawEventRow,
} from "@/lib/metrics";

const NOW = new Date("2026-09-18T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("windowFor", () => {
  it("buckets the last 7 days as 'this'", () => {
    expect(windowFor(ago(0), NOW)).toBe("this");
    expect(windowFor(ago(1 * DAY), NOW)).toBe("this");
    expect(windowFor(ago(7 * DAY - 1), NOW)).toBe("this");
  });

  it("buckets days 7–14 as 'last'", () => {
    expect(windowFor(ago(7 * DAY), NOW)).toBe("last");
    expect(windowFor(ago(10 * DAY), NOW)).toBe("last");
    expect(windowFor(ago(14 * DAY - 1), NOW)).toBe("last");
  });

  it("returns null for events older than 14 days", () => {
    expect(windowFor(ago(14 * DAY), NOW)).toBe(null);
    expect(windowFor(ago(30 * DAY), NOW)).toBe(null);
  });

  it("returns null for future timestamps", () => {
    expect(windowFor(new Date(NOW.getTime() + DAY), NOW)).toBe(null);
  });

  it("returns null for unparseable input", () => {
    expect(windowFor("not-a-date", NOW)).toBe(null);
  });

  it("accepts Date and string alike", () => {
    expect(windowFor(new Date(NOW.getTime() - DAY), NOW)).toBe("this");
    expect(windowFor(ago(DAY), NOW)).toBe("this");
  });
});

describe("deltaPct", () => {
  it("computes whole-number percent change", () => {
    expect(deltaPct(150, 100)).toBe(50);
    expect(deltaPct(50, 100)).toBe(-50);
    expect(deltaPct(100, 100)).toBe(0);
  });

  it("rounds to the nearest whole percent", () => {
    expect(deltaPct(7, 3)).toBe(133);
  });

  it("returns null when there is no base (last week = 0)", () => {
    expect(deltaPct(5, 0)).toBe(null);
    expect(deltaPct(0, 0)).toBe(null);
  });
});

describe("computeUsageMetrics", () => {
  it("returns all-zero pairs for no events", () => {
    const m = computeUsageMetrics([], NOW);
    expect(m.activeRiders).toEqual({ thisWeek: 0, lastWeek: 0, deltaPct: null });
    expect(m.generationsRequested.thisWeek).toBe(0);
    expect(m.signups.deltaPct).toBe(null);
  });

  it("counts distinct riders per window (deduping a rider's many events)", () => {
    const rows: RawEventRow[] = [
      { event: ANALYTICS_EVENTS.ROUTE_VIEWED, user_id: "u1", created_at: ago(DAY) },
      { event: ANALYTICS_EVENTS.GPX_DOWNLOADED, user_id: "u1", created_at: ago(2 * DAY) },
      { event: ANALYTICS_EVENTS.ROUTE_VIEWED, user_id: "u2", created_at: ago(3 * DAY) },
      { event: ANALYTICS_EVENTS.ROUTE_VIEWED, user_id: "u3", created_at: ago(9 * DAY) },
      { event: ANALYTICS_EVENTS.ROUTE_VIEWED, user_id: null, created_at: ago(DAY) },
    ];
    const m = computeUsageMetrics(rows, NOW);
    expect(m.activeRiders.thisWeek).toBe(2); // u1, u2
    expect(m.activeRiders.lastWeek).toBe(1); // u3
    expect(m.activeRiders.deltaPct).toBe(100);
  });

  it("tallies the generation funnel into the right windows", () => {
    const rows: RawEventRow[] = [
      { event: ANALYTICS_EVENTS.GENERATION_REQUESTED, user_id: "u1", created_at: ago(DAY) },
      { event: ANALYTICS_EVENTS.GENERATION_REQUESTED, user_id: "u1", created_at: ago(2 * DAY) },
      { event: ANALYTICS_EVENTS.GENERATION_SUCCEEDED, user_id: "u1", created_at: ago(DAY) },
      { event: ANALYTICS_EVENTS.GENERATION_DECLINED, user_id: "u1", created_at: ago(2 * DAY) },
      { event: ANALYTICS_EVENTS.GENERATION_REQUESTED, user_id: "u2", created_at: ago(9 * DAY) },
    ];
    const m = computeUsageMetrics(rows, NOW);
    expect(m.generationsRequested.thisWeek).toBe(2);
    expect(m.generationsRequested.lastWeek).toBe(1);
    expect(m.generationsSucceeded.thisWeek).toBe(1);
    expect(m.generationsDeclined.thisWeek).toBe(1);
  });

  it("counts signups only for auth events flagged new_user (bool or string)", () => {
    const rows: RawEventRow[] = [
      { event: ANALYTICS_EVENTS.AUTH_SUCCEEDED, user_id: "u1", created_at: ago(DAY), new_user: true },
      { event: ANALYTICS_EVENTS.AUTH_SUCCEEDED, user_id: "u2", created_at: ago(DAY), new_user: "true" },
      { event: ANALYTICS_EVENTS.AUTH_SUCCEEDED, user_id: "u3", created_at: ago(DAY), new_user: false },
      { event: ANALYTICS_EVENTS.AUTH_SUCCEEDED, user_id: "u4", created_at: ago(DAY) },
    ];
    const m = computeUsageMetrics(rows, NOW);
    expect(m.signups.thisWeek).toBe(2);
    expect(m.activeRiders.thisWeek).toBe(4); // all four are active riders
  });

  it("ignores events outside the 14-day window", () => {
    const rows: RawEventRow[] = [
      { event: ANALYTICS_EVENTS.ROUTE_VIEWED, user_id: "u1", created_at: ago(20 * DAY) },
      { event: ANALYTICS_EVENTS.GPX_DOWNLOADED, user_id: "u1", created_at: ago(DAY) },
    ];
    const m = computeUsageMetrics(rows, NOW);
    expect(m.routesViewed.thisWeek).toBe(0);
    expect(m.routesViewed.lastWeek).toBe(0);
    expect(m.gpxDownloads.thisWeek).toBe(1);
  });

  it("counts imports and downloads independently", () => {
    const rows: RawEventRow[] = [
      { event: ANALYTICS_EVENTS.ROUTE_IMPORTED, user_id: "u1", created_at: ago(DAY) },
      { event: ANALYTICS_EVENTS.ROUTE_IMPORTED, user_id: "u2", created_at: ago(DAY) },
      { event: ANALYTICS_EVENTS.GPX_DOWNLOADED, user_id: "u1", created_at: ago(DAY) },
    ];
    const m = computeUsageMetrics(rows, NOW);
    expect(m.imports.thisWeek).toBe(2);
    expect(m.gpxDownloads.thisWeek).toBe(1);
  });
});
