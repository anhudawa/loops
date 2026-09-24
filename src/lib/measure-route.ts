/**
 * Measure a stored route's roads (the Road Standard report) by tracing its
 * track through the engine — the same trace a route page triggers, shared
 * with the daily job and the admin batch so unmeasured routes (hidden from
 * lists until measured) get measured without anyone opening them.
 */
import { storeRouteRoadReport, getUnmeasuredRoutes } from "./db";
import { engineTrace } from "./route-generator";
import { traceRoadReport, traceProfileChain } from "./road-trace";
import { ensureTraceProfile } from "./engine-profiles";
import { nameCompromises } from "./road-segments";

export const TRACE_BUDGET_MS = 20_000;

/** Trace and store one route's road report. True when a report was stored (null = unknown, retried later). */
export async function measureRoute(route: { id: string; coordinates: string; discipline?: string | null }, budgetMs = TRACE_BUDGET_MS): Promise<boolean> {
  if (!process.env.BROUTER_URL) return false;
  const coords: [number, number][] = JSON.parse(route.coordinates).map((c: number[]) => [c[0], c[1]]);
  const discipline = route.discipline === "gravel" || route.discipline === "mtb" ? route.discipline : "road";
  const namer = (c: [number, number][], comps: Parameters<typeof nameCompromises>[1]) => nameCompromises(c, comps, fetch, { timeoutMs: 8000, max: 3 });
  const permissive = await ensureTraceProfile(process.env.BROUTER_URL);
  const chain = traceProfileChain(discipline, permissive);
  const report = await traceRoadReport(coords, discipline, (wps, profile) => engineTrace(wps, profile), budgetMs, namer, chain);
  if (!report) return false;
  await storeRouteRoadReport(route.id, report);
  return true;
}

/** Measure unmeasured routes until the time budget runs out. */
export async function measureUnmeasured(budgetMs: number): Promise<{ measured: number; unknown: number; left: number }> {
  const started = Date.now();
  const todo = await getUnmeasuredRoutes(200);
  let measured = 0, unknown = 0, left = 0;
  for (const r of todo) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < 8000) { left++; continue; }
    const ok = await measureRoute(r, Math.min(TRACE_BUDGET_MS, remaining - 2000)).catch(() => false);
    if (ok) measured++; else unknown++;
  }
  return { measured, unknown, left };
}
