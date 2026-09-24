/**
 * Draw stress suite (not part of `npm test`): hundreds of drawn routes
 * through the real POST /api/reroute handler and a real BRouter engine,
 * leg by leg the way the Draw screen asks for them (the rest of the drawing
 * as roads to avoid, the tail of the arriving leg to ride through, then the
 * closing leg home). Only sign-in is stubbed.
 *
 *   DRAW_STRESS=1 BROUTER_URL=http://127.0.0.1:17777/brouter \
 *     DRAW_OUT=/tmp/draw-stress.jsonl npx vitest run src/lib/__tests__/draw-stress.test.ts
 *
 * Env: DRAW_ROUTES (drawings per region, default 20), DRAW_PARALLEL
 * (drawings at once, default 3 — riders drawing at the same time), DRAW_SEED.
 */
import { describe, it, expect, vi } from "vitest";
import { appendFileSync } from "node:fs";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", async (orig) => ({
  ...(await orig<typeof import("@/lib/db")>()),
  // One rider per drawing (the per-rider rate limit is part of what is tested).
  getUserBySession: async (token: string) => ({ id: token, email: "stress@example.com", name: "Stress", role: "user" }),
}));

import { POST } from "@/app/api/reroute/route";
import { placesNear } from "@/lib/map-labels";

type LL = [number, number];
const REGIONS: Array<{ name: string; centre: LL; radiusKm: number }> = [
  { name: "Dublin city", centre: [53.345, -6.26], radiusKm: 12 },
  { name: "North Dublin", centre: [53.5, -6.2], radiusKm: 20 },
  { name: "Wicklow", centre: [53.1, -6.3], radiusKm: 25 },
  { name: "Cork", centre: [51.9, -8.47], radiusKm: 25 },
  { name: "Galway", centre: [53.27, -9.05], radiusKm: 25 },
  { name: "Kilkenny", centre: [52.65, -7.25], radiusKm: 25 },
  { name: "Mallorca", centre: [39.75, 2.9], radiusKm: 30 },
  { name: "Girona", centre: [41.98, 2.82], radiusKm: 30 },
  { name: "Malaga", centre: [36.75, -4.4], radiusKm: 25 },
  { name: "Gran Canaria", centre: [27.9, -15.55], radiusKm: 20 },
  { name: "Algarve", centre: [37.1, -8.0], radiusKm: 30 },
];

let seed = Number(process.env.DRAW_SEED ?? 7);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const km = (a: LL, b: LL) => Math.hypot((b[0] - a[0]) * 111.32, (b[1] - a[1]) * 111.32 * Math.cos((a[0] * Math.PI) / 180));

/** A drawing: 3–9 pins roughly around a loop, some on towns, some tapped nearby (riders tap near roads). */
function drawing(region: (typeof REGIONS)[number]): LL[] {
  const towns = placesNear(region.centre, region.radiusKm).filter((t) => t.pop >= 300);
  const n = 3 + Math.floor(rnd() * 7);
  const start = towns.length ? towns[Math.floor(rnd() * towns.length)] : { lat: region.centre[0], lng: region.centre[1] };
  const s: LL = [start.lat, start.lng];
  const radius = 3 + rnd() * (region.radiusKm * 0.6);
  const pins: LL[] = [s];
  const phase = rnd() * Math.PI * 2;
  for (let i = 1; i < n; i++) {
    const ang = phase + (i / n) * Math.PI * 2;
    const want: LL = [s[0] + (Math.sin(ang) * radius) / 111.32 + (Math.sin(ang) * radius) / 111.32 * 0, s[1] + (Math.cos(ang) * radius) / (111.32 * Math.cos((s[0] * Math.PI) / 180))];
    // Riders tap on land, near roads: on a town, or a few hundred metres
    // off one. A pin with no town within 6 km (sea, mountain) is skipped.
    const near = placesNear(want, 6);
    if (!near.length) continue;
    const t = near[Math.floor(rnd() * Math.min(3, near.length))];
    const p: LL = rnd() < 0.5 ? [t.lat, t.lng] : [t.lat + (rnd() - 0.5) * 0.012, t.lng + (rnd() - 0.5) * 0.018];
    pins.push(p);
  }
  return pins;
}

async function leg(rider: string, from: LL, to: LL, avoid: LL[][], arrive?: LL[]) {
  const req = new NextRequest("http://localhost/api/reroute", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `session=${rider}` },
    body: JSON.stringify({ waypoints: [from, to], discipline: "road", avoid, arrive }),
  });
  const t = Date.now();
  const res = await POST(req);
  const body = await res.json().catch(() => null);
  return { status: res.status, ms: Date.now() - t, body };
}

describe.skipIf(!process.env.DRAW_STRESS)("draw stress", () => {
  it("draws hundreds of routes", async () => {
    const OUT = process.env.DRAW_OUT ?? "/tmp/draw-stress.jsonl";
    const perRegion = Number(process.env.DRAW_ROUTES ?? 20);
    const jobs: Array<{ region: string; pins: LL[] }> = [];
    for (const r of REGIONS) for (let i = 0; i < perRegion; i++) jobs.push({ region: r.name, pins: drawing(r) });
    const parallel = Number(process.env.DRAW_PARALLEL ?? 3);
    let next = 0;
    const run = async () => {
      while (next < jobs.length) {
        const j = jobs[next++];
        const snapped: LL[][] = [];
        let prevTail: LL[] | undefined;
        const legs: Array<[LL, LL]> = j.pins.slice(1).map((p, i) => [j.pins[i], p] as [LL, LL]);
        if (j.pins.length >= 3) legs.push([j.pins[j.pins.length - 1], j.pins[0]]); // closing leg
        for (const [i, [a, b]] of legs.entries()) {
          const r = await leg(`rider-${jobs.indexOf(j)}`, a, b, snapped.slice(-12), prevTail);
          const coords = (r.body?.data?.coordinates ?? []) as number[][];
          const rep = r.body?.data?.road_report;
          const straight = km(a, b);
          const rec = {
            region: j.region, drawing: jobs.indexOf(j), leg: i, closing: i === legs.length - 1 && j.pins.length >= 3,
            from: a, to: b, straight_km: +straight.toFixed(2), status: r.status, code: r.body?.code ?? null, error: r.body?.error ?? null,
            ms: r.ms, km: r.body?.data?.distance_km ?? null, pts: coords.length,
            detour: r.body?.data?.distance_km && straight > 0.2 ? +(r.body.data.distance_km / straight).toFixed(2) : null,
            standard_met: rep?.standard_met ?? null, compromises: rep?.compromises?.length ?? null, summary: rep?.summary?.slice(0, 120) ?? null,
            start_gap_m: coords.length ? Math.round(km(a, [coords[0][0], coords[0][1]]) * 1000) : null,
            end_gap_m: coords.length ? Math.round(km(b, [coords[coords.length - 1][0], coords[coords.length - 1][1]]) * 1000) : null,
          };
          appendFileSync(OUT, JSON.stringify(rec) + "\n");
          if (coords.length >= 2) { snapped.push(coords.map((c) => [c[0], c[1]] as LL)); prevTail = coords.slice(-150).map((c) => [c[0], c[1]] as LL); }
          else prevTail = undefined;
        }
      }
    };
    await Promise.all(Array.from({ length: parallel }, run));
    expect(jobs.length).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);
});
