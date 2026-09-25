import { NextRequest, NextResponse } from "next/server";
import { getUserBySession, getMyRides } from "@/lib/db";
import { tidyRouteName } from "@/lib/public-route";
import { apiError, handleApiError } from "@/lib/api-utils";

/** GET /api/rides/mine → { data: MyRide[] } — rides the rider shared or answered. */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const user = token ? await getUserBySession(token).catch(() => null) : null;
    if (!user) return apiError("Sign in to see your rides", "UNAUTHORIZED", 401);
    const rides = await getMyRides(user.id);
    return NextResponse.json({ data: rides.map((r) => ({ ...r, route_name: tidyRouteName(r.route_name) })) });
  } catch (err) {
    return handleApiError(err);
  }
}
