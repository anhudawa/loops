import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  insertRoute,
  getUserBySession,
} from "@/lib/db";
import { apiError, handleApiError, stripHtml } from "@/lib/api-utils";
import {
  DISCIPLINES,
  MAX_ROUTE_NAME_LENGTH,
  MAX_ROUTE_DESCRIPTION_LENGTH,
  DEFAULT_COUNTRY,
  RATE_LIMIT_WRITE,
} from "@/config/constants";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/routes/from-generated
 *
 * Save a freshly generated route to the current user's library. Used by
 * /generate when the rider wants to keep a build. Because the route data
 * is already computed by the generator (distance/elevation/coordinates
 * with per-point elevation), this endpoint never touches BRouter or
 * Overpass — it just validates, normalises, and inserts.
 */

interface Body {
  name?: string;
  description?: string | null;
  coordinates?: [number, number][];
  elevations?: number[];
  distance_km?: number;
  elevation_gain_m?: number;
  elevation_loss_m?: number;
  discipline?: string;
  surface_type?: string;
  county?: string;
  country?: string;
  region?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("session")?.value;
    if (!sessionToken) {
      return apiError("Sign in to save generated routes", "UNAUTHORIZED", 401);
    }
    const user = await getUserBySession(sessionToken);
    if (!user) {
      return apiError("Sign in to save generated routes", "UNAUTHORIZED", 401);
    }

    const rl = checkRateLimit(
      `routes-from-generated:${user.id}`,
      RATE_LIMIT_WRITE,
      60_000
    );
    if (!rl.allowed) {
      const retrySec = Math.max(1, Math.ceil(rl.resetMs / 1000));
      return new NextResponse(
        JSON.stringify({
          error: `Too many requests. Try again in ${retrySec}s.`,
          code: "RATE_LIMITED",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retrySec),
          },
        }
      );
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return apiError("Invalid JSON body", "INVALID_BODY", 400);
    }

    // ── Validate inputs ────────────────────────────────────────────────────
    const name = typeof body.name === "string" ? stripHtml(body.name).trim() : "";
    if (!name || name.length > MAX_ROUTE_NAME_LENGTH) {
      return apiError(`Route name required, max ${MAX_ROUTE_NAME_LENGTH} chars`, "VALIDATION_ERROR", 400);
    }

    const description =
      typeof body.description === "string" && body.description.length > 0
        ? stripHtml(body.description).trim()
        : null;
    if (description && description.length > MAX_ROUTE_DESCRIPTION_LENGTH) {
      return apiError(`Description too long (max ${MAX_ROUTE_DESCRIPTION_LENGTH} chars)`, "VALIDATION_ERROR", 400);
    }

    if (!Array.isArray(body.coordinates) || body.coordinates.length < 2) {
      return apiError("coordinates must be an array of at least 2 points", "VALIDATION_ERROR", 400);
    }
    for (const pt of body.coordinates) {
      if (!Array.isArray(pt) || pt.length < 2) {
        return apiError("each coordinate must be [lat, lng]", "VALIDATION_ERROR", 400);
      }
      const [lat, lng] = pt;
      if (typeof lat !== "number" || typeof lng !== "number") {
        return apiError("coordinates must be numbers", "VALIDATION_ERROR", 400);
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return apiError("coordinate out of valid range", "VALIDATION_ERROR", 400);
      }
    }

    if (typeof body.distance_km !== "number" || body.distance_km <= 0) {
      return apiError("distance_km required and positive", "VALIDATION_ERROR", 400);
    }
    if (typeof body.elevation_gain_m !== "number" || body.elevation_gain_m < 0) {
      return apiError("elevation_gain_m required and non-negative", "VALIDATION_ERROR", 400);
    }
    const elevationLoss = typeof body.elevation_loss_m === "number" ? body.elevation_loss_m : 0;

    const discipline = body.discipline ?? "road";
    if (!(DISCIPLINES as readonly string[]).includes(discipline)) {
      return apiError(`discipline must be one of ${DISCIPLINES.join(", ")}`, "VALIDATION_ERROR", 400);
    }

    // surface_type defaults map the discipline sensibly
    const surfaceType =
      body.surface_type ??
      (discipline === "gravel" ? "gravel" : discipline === "mtb" ? "trail" : "road");
    const validSurfaces = ["road", "gravel", "mixed", "trail", "singletrack", "technical"];
    if (!validSurfaces.includes(surfaceType)) {
      return apiError("invalid surface_type", "VALIDATION_ERROR", 400);
    }

    const country = (body.country && body.country.trim()) || DEFAULT_COUNTRY;
    const county =
      body.county && body.county.trim() ? body.county.trim() : (body.region?.trim() || country);
    const region = body.region?.trim() || county;

    // Merge per-point elevations into coordinates as [lat, lng, ele]
    const coordsWithElevation = body.coordinates.map((coord, i) => {
      const ele = body.elevations?.[i];
      return typeof ele === "number" && !Number.isNaN(ele)
        ? [coord[0], coord[1], Math.round(ele * 10) / 10]
        : [coord[0], coord[1]];
    });

    const id = uuidv4();
    const route = await insertRoute({
      id,
      name,
      description,
      distance_km: Math.round(body.distance_km * 10) / 10,
      elevation_gain_m: Math.round(body.elevation_gain_m),
      elevation_loss_m: Math.round(elevationLoss),
      surface_type: surfaceType as "road" | "gravel" | "mixed" | "trail" | "singletrack" | "technical",
      county,
      country,
      region,
      discipline: discipline as "road" | "gravel" | "mtb",
      start_lat: body.coordinates[0][0],
      start_lng: body.coordinates[0][1],
      gpx_filename: null,
      coordinates: JSON.stringify(coordsWithElevation),
      created_by: user.id,
      strava_activity_id: null,
      quality_status: "pending",
    });

    return NextResponse.json({ data: route }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
