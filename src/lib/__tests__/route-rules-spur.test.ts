import { describe, it, expect } from "vitest";
import { findLongestSpur, validateRouteRules } from "@/lib/route-rules";

// ── Synthetic geometry helpers (≈ 53.5°N: 1 km ≈ 0.009° lat, ≈ 0.0151° lng) ──
const KM_LAT = 0.009;
const KM_LNG = 0.0151;
type P = [number, number];

/** Straight run from `from` for `km` in the given lat/lng direction, ~20 m spacing. */
function walk(from: P, dLatKm: number, dLngKm: number, km: number): P[] {
  const steps = Math.max(1, Math.round((km * 1000) / 20));
  const out: P[] = [];
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    out.push([from[0] + dLatKm * KM_LAT * km * f, from[1] + dLngKm * KM_LNG * km * f]);
  }
  return out;
}

/** A clean 5 km × 5 km rectangle loop (≈20 km), no retracing. */
function cleanLoop(): P[] {
  const start: P = [53.5, -6.1];
  let pts: P[] = [start];
  let cur = start;
  for (const [dlat, dlng] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    const seg = walk(cur, dlat, dlng, 5);
    pts = pts.concat(seg);
    cur = seg[seg.length - 1];
  }
  return pts;
}

/** Same rectangle, but from the middle of the north edge it shoots 1.5 km
 *  north, U-turns, and retraces the SAME line back — a spur. */
function spurLoop(): P[] {
  const start: P = [53.5, -6.1];
  let pts: P[] = [start];
  let cur = start;
  // west edge north
  let seg = walk(cur, 1, 0, 5); pts = pts.concat(seg); cur = seg[seg.length - 1];
  // north edge, first half east
  seg = walk(cur, 0, 1, 2.5); pts = pts.concat(seg); cur = seg[seg.length - 1];
  // SPUR: out 1.5 km north and straight back
  const out = walk(cur, 1, 0, 1.5);
  const back = [...out].reverse().slice(1).concat([cur]);
  pts = pts.concat(out, back);
  // rest of north edge, then east edge south, then south edge west
  seg = walk(cur, 0, 1, 2.5); pts = pts.concat(seg); cur = seg[seg.length - 1];
  seg = walk(cur, -1, 0, 5); pts = pts.concat(seg); cur = seg[seg.length - 1];
  seg = walk(cur, 0, -1, 5); pts = pts.concat(seg);
  return pts;
}

/** A loop whose final ~300 m retraces its first ~300 m (a shared access
 *  road to the start) — normal loop closure, NOT a spur. */
function closureLoop(): P[] {
  const home: P = [53.5, -6.1];
  const access = walk(home, 1, 0, 0.3); // 300 m north to the loop proper
  const junction = access[access.length - 1];
  let pts: P[] = [home, ...access];
  let cur = junction;
  for (const [dlat, dlng] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    const seg = walk(cur, dlat, dlng, 5);
    pts = pts.concat(seg);
    cur = seg[seg.length - 1];
  }
  // back down the access road to home
  pts = pts.concat([...access].reverse().slice(1), [home]);
  return pts;
}

/** A loop whose start is at the end of a 1.6 km causeway: the ride MUST go
 *  out the causeway and back along it at the finish (Bull Island / Clontarf). */
function causewayLoop(): P[] {
  const home: P = [53.36, -6.17];
  const causeway = walk(home, 1, 0, 1.6);
  const junction = causeway[causeway.length - 1];
  let pts: P[] = [home, ...causeway];
  let cur = junction;
  for (const [dlat, dlng] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    const seg = walk(cur, dlat, dlng, 5);
    pts = pts.concat(seg);
    cur = seg[seg.length - 1];
  }
  return pts.concat([...causeway].reverse().slice(1), [home]);
}

describe("findLongestSpur", () => {
  it("finds no meaningful spur on a clean loop", () => {
    const s = findLongestSpur(cleanLoop());
    expect(s === null || s.spurKm < 0.4).toBe(true);
  });

  it("measures a 1.5 km MID-ROUTE U-turn spur", () => {
    const s = findLongestSpur(spurLoop());
    expect(s).not.toBeNull();
    expect(s!.spurKm).toBeGreaterThan(1.2);
    expect(s!.spurKm).toBeLessThan(1.8);
  });

  it("classifies a short shared start/finish road as access, not a spur", () => {
    const s = findLongestSpur(closureLoop());
    expect(s === null || s.spurKm <= 0.4).toBe(true);
  });

  it("classifies a 1.6 km causeway/peninsula start as ACCESS, not a spur (the Bull Island case)", () => {
    const s = findLongestSpur(causewayLoop());
    expect(s).not.toBeNull();
    expect(s!.spurKm).toBeLessThanOrEqual(0.4);   // no mid-route spur
    expect(s!.accessKm).toBeGreaterThan(1.3);     // the causeway, reported
  });
});

describe("SPUR_UTURN rule", () => {
  const opts = (coords: P[]) => ({ elevationGain: 0, distanceKm: 20, rejectSpurs: true });

  it("rejects a generated loop that contains a spur", () => {
    const r = validateRouteRules(spurLoop(), "road", null, opts(spurLoop()));
    const spur = r.violations.find((v) => v.rule === "SPUR_UTURN");
    expect(spur).toBeDefined();
    expect(spur!.severity).toBe("fatal");
    expect(spur!.message).toMatch(/\d+ m out-and-back spur/);
    expect(r.passed).toBe(false);
  });

  it("SERVES a causeway-start loop, with the access retrace reported as a warning (trust rule)", () => {
    const r = validateRouteRules(causewayLoop(), "road", null, { elevationGain: 0, distanceKm: 23, rejectSpurs: true });
    expect(r.violations.find((v) => v.rule === "SPUR_UTURN")).toBeUndefined();
    const access = r.violations.find((v) => v.rule === "ACCESS_RETRACE");
    expect(access).toBeDefined();
    expect(access!.severity).toBe("warning");
    expect(access!.message).toMatch(/\d+ m out-and-back on the access road/);
  });

  it("passes a clean generated loop", () => {
    const r = validateRouteRules(cleanLoop(), "road", null, opts(cleanLoop()));
    expect(r.violations.find((v) => v.rule === "SPUR_UTURN")).toBeUndefined();
  });

  it("does NOT apply to rider-drawn routes (flag off) — an out-and-back may be intended", () => {
    const r = validateRouteRules(spurLoop(), "road", null, { elevationGain: 0, distanceKm: 20 });
    expect(r.violations.find((v) => v.rule === "SPUR_UTURN")).toBeUndefined();
  });
});
