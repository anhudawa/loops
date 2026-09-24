import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { autoTitle } from "@/lib/route-title";

/** POST { coordinates: [lat,lng][], distance_km } → { data: { title } } — "Clontarf – Ashbourne – Clontarf · 117 km". */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { coordinates?: unknown; distance_km?: unknown } | null;
  const raw = Array.isArray(body?.coordinates) ? (body!.coordinates as unknown[]) : [];
  const step = Math.max(1, Math.ceil(raw.length / 2000));
  const coords = raw
    .filter((_, i) => i % step === 0 || i === raw.length - 1)
    .filter((q): q is [number, number] => Array.isArray(q) && typeof q[0] === "number" && typeof q[1] === "number" && Math.abs(q[0]) <= 90 && Math.abs(q[1]) <= 180);
  const km = typeof body?.distance_km === "number" && body.distance_km > 0 ? body.distance_km : 0;
  if (coords.length < 2 || !km) return apiError("coordinates and distance_km required", "VALIDATION_ERROR", 400);
  return NextResponse.json({ data: { title: autoTitle(coords, km) } });
}
