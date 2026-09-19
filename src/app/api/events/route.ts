import { NextRequest, NextResponse } from "next/server";
import { getUserBySession, recordEvent } from "@/lib/db";
import { CLIENT_BEACON_EVENTS } from "@/lib/metrics";

/**
 * First-party analytics beacon for events that only happen in the browser —
 * chiefly client-side GPX downloads (the planner and the generate page build
 * the GPX as a blob and never hit a server route) and the "route drawn"
 * milestone. Server-side events are recorded at their own routes, not here.
 *
 * Deliberately tiny and defensive: only allow-listed event names, only a
 * shallow set of safe scalar properties, always fire-and-safe, never blocks.
 */

/** Keep properties to a handful of small scalars — no PII, no nested blobs. */
function sanitizeProperties(input: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!input || typeof input !== "object") return out;
  let n = 0;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (n >= 12) break;
    if (!/^[a-z0-9_]{1,40}$/i.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 80);
    else continue;
    n++;
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const event = typeof body?.event === "string" ? body.event : null;

    // Only allow-listed browser events. Silently accept unknowns so a stray
    // client call is never an error the user sees.
    if (!event || !CLIENT_BEACON_EVENTS.has(event)) {
      return new NextResponse(null, { status: 204 });
    }

    const sessionToken = request.cookies.get("session")?.value;
    const user = sessionToken
      ? await getUserBySession(sessionToken).catch(() => null)
      : null;

    void recordEvent(event, {
      userId: user?.id ?? null,
      properties: sanitizeProperties(body?.properties),
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    // Analytics must never fail the caller.
    return new NextResponse(null, { status: 204 });
  }
}
