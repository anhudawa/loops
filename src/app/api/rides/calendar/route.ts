import { NextRequest } from "next/server";
import { getRoute } from "@/lib/db";
import { parseRideTime, cleanMeet, rideCalendar, rideUrl, formatRideWhen } from "@/lib/ride-invite";
import { estimateRideMinutes, formatRideTime } from "@/lib/ride-time";
import { withAutoTitle } from "@/lib/route-title";
import { withTrueClimb } from "@/lib/true-climb";
import { apiError, handleApiError } from "@/lib/api-utils";

/**
 * GET /api/rides/calendar?route=<id>&t=<YYYY-MM-DDTHH:MM>&m=<meet>
 * → the group ride as an .ics entry (phones open it straight into the
 * calendar). Same key as the ride link; nothing is stored.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;
    const routeId = sp.get("route") ?? "";
    const t = sp.get("t") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(routeId) || !parseRideTime(t)) return apiError("Unknown ride", "INVALID_RIDE", 400);
    const stored = await getRoute(routeId);
    const route = stored ? withTrueClimb(withAutoTitle(stored)) : null;
    if (!route) return apiError("Route not found", "NOT_FOUND", 404);
    const meet = cleanMeet(sp.get("m"));
    const name = route.name;
    const minutes = estimateRideMinutes({ distance_km: Number(route.distance_km), elevation_gain_m: Number(route.elevation_gain_m), discipline: "road" });
    const url = rideUrl("https://www.loops.ie", routeId, t, meet);
    const details = [
      `${name} — ${formatRideWhen(t)}${meet ? ` · Meet: ${meet}` : ""}`,
      `${Number(route.distance_km)} km · +${Math.round(Number(route.elevation_gain_m))} m · ${formatRideTime(minutes, { style: "card" })} riding`,
      "Route, roll call and GPX:",
    ].join("\n");
    const ics = rideCalendar({ routeId, t, meet, name, minutes, url, details });
    if (!ics) return apiError("Unknown ride", "INVALID_RIDE", 400);
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="loops-ride-${t.slice(0, 10)}.ics"`,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
