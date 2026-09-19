/**
 * Usage-metrics logic — PURE, no database.
 *
 * The evidence layer the board reads (weekly active riders, funnel
 * conversion) is computed here from raw event rows so it can be unit
 * tested without a live DB. `src/lib/db.ts` fetches the rows and hands
 * them to `computeUsageMetrics`; nothing in this file touches Postgres.
 *
 * "This week" and "last week" are rolling 7-day windows anchored at now:
 *   this week  = [now - 7d,  now]
 *   last week  = [now - 14d, now - 7d)
 * No extrapolation, no projection — plain counts of what was recorded.
 */

/** Canonical first-party event names. Call sites and queries share these. */
export const ANALYTICS_EVENTS = {
  GENERATION_REQUESTED: "route_generation_requested",
  GENERATION_SUCCEEDED: "route_generation_succeeded",
  GENERATION_DECLINED: "route_generation_declined",
  ROUTE_VIEWED: "route_viewed",
  GPX_DOWNLOADED: "gpx_downloaded",
  ROUTE_IMPORTED: "route_imported",
  ROUTE_SAVED: "route_saved",
  PLAN_DRAWN: "plan_route_drawn",
  AUTH_SUCCEEDED: "auth_succeeded",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** Events a browser is allowed to report via the /api/events beacon. Keep
 *  this tight — the server owns everything else. */
export const CLIENT_BEACON_EVENTS: ReadonlySet<string> = new Set([
  ANALYTICS_EVENTS.GPX_DOWNLOADED,
  ANALYTICS_EVENTS.PLAN_DRAWN,
]);

/** A single event row as read from the DB (or a test fixture). */
export interface RawEventRow {
  event: string;
  user_id: string | null;
  created_at: string | Date;
  /** Materialised from properties->>'new_user' for signup counting. */
  new_user?: boolean | string | null;
}

/** One metric across the two windows plus its week-over-week change. */
export interface MetricPair {
  thisWeek: number;
  lastWeek: number;
  /** Whole-number percent change, or null when last week was zero (no base). */
  deltaPct: number | null;
}

export interface UsageMetrics {
  activeRiders: MetricPair;
  generationsRequested: MetricPair;
  generationsSucceeded: MetricPair;
  generationsDeclined: MetricPair;
  routesViewed: MetricPair;
  gpxDownloads: MetricPair;
  imports: MetricPair;
  signups: MetricPair;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which rolling window a timestamp falls in relative to `now`.
 * Future timestamps and anything older than 14 days return null.
 */
export function windowFor(
  createdAt: string | Date,
  now: Date
): "this" | "last" | null {
  const t = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  if (Number.isNaN(t)) return null;
  const ageMs = now.getTime() - t;
  if (ageMs < 0) return null; // future — ignore
  if (ageMs < 7 * DAY_MS) return "this";
  if (ageMs < 14 * DAY_MS) return "last";
  return null;
}

/**
 * Week-over-week percent change, rounded to a whole number.
 * Returns null when there is no base to compare against (last week = 0),
 * so callers can show "—" rather than a fabricated percentage.
 */
export function deltaPct(thisWeek: number, lastWeek: number): number | null {
  if (lastWeek === 0) return null;
  return Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
}

function pair(thisWeek: number, lastWeek: number): MetricPair {
  return { thisWeek, lastWeek, deltaPct: deltaPct(thisWeek, lastWeek) };
}

function isTrue(v: RawEventRow["new_user"]): boolean {
  return v === true || v === "true" || v === "t";
}

/**
 * Aggregate raw event rows into the two-window usage picture.
 * Rows outside the 14-day window are ignored, so the caller can pass a
 * slightly wider fetch without affecting the result.
 */
export function computeUsageMetrics(rows: RawEventRow[], now: Date): UsageMetrics {
  // Simple counters per window.
  const counts = {
    this: {
      genReq: 0,
      genOk: 0,
      genNo: 0,
      viewed: 0,
      gpx: 0,
      imports: 0,
      signups: 0,
    },
    last: {
      genReq: 0,
      genOk: 0,
      genNo: 0,
      viewed: 0,
      gpx: 0,
      imports: 0,
      signups: 0,
    },
  };
  // Distinct signed-in riders per window (any event with a user_id).
  const riders = { this: new Set<string>(), last: new Set<string>() };

  for (const row of rows) {
    const w = windowFor(row.created_at, now);
    if (!w) continue;
    const bucket = counts[w];

    if (row.user_id) riders[w].add(row.user_id);

    switch (row.event) {
      case ANALYTICS_EVENTS.GENERATION_REQUESTED:
        bucket.genReq++;
        break;
      case ANALYTICS_EVENTS.GENERATION_SUCCEEDED:
        bucket.genOk++;
        break;
      case ANALYTICS_EVENTS.GENERATION_DECLINED:
        bucket.genNo++;
        break;
      case ANALYTICS_EVENTS.ROUTE_VIEWED:
        bucket.viewed++;
        break;
      case ANALYTICS_EVENTS.GPX_DOWNLOADED:
        bucket.gpx++;
        break;
      case ANALYTICS_EVENTS.ROUTE_IMPORTED:
        bucket.imports++;
        break;
      case ANALYTICS_EVENTS.AUTH_SUCCEEDED:
        if (isTrue(row.new_user)) bucket.signups++;
        break;
      default:
        break;
    }
  }

  return {
    activeRiders: pair(riders.this.size, riders.last.size),
    generationsRequested: pair(counts.this.genReq, counts.last.genReq),
    generationsSucceeded: pair(counts.this.genOk, counts.last.genOk),
    generationsDeclined: pair(counts.this.genNo, counts.last.genNo),
    routesViewed: pair(counts.this.viewed, counts.last.viewed),
    gpxDownloads: pair(counts.this.gpx, counts.last.gpx),
    imports: pair(counts.this.imports, counts.last.imports),
    signups: pair(counts.this.signups, counts.last.signups),
  };
}
