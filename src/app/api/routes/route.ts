import { NextRequest, NextResponse } from "next/server";
import { createRiddenRouteSubmission, getRoutes, getCounties, getRegions, getCountries, getUserBySession } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { ROUTES_PER_PAGE, MAX_ROUTE_NAME_LENGTH, MAX_ROUTE_DESCRIPTION_LENGTH, DISCIPLINES, DEFAULT_SPEED_KMH, DEFAULT_COUNTRY } from "@/config/constants";
import {
  ACTIVE_LAUNCH_MARKET,
  PUBLIC_DISCIPLINE,
  PUBLIC_SURFACE_TYPE,
} from "@/config/route-policy";
import { v4 as uuidv4 } from "uuid";
import { hasActiveBetaAccess } from "@/lib/beta-intake";
import { prepareRideSubmission, RouteSubmissionError } from "@/lib/route-submission";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Return distinct countries
    if (searchParams.get("countries") === "true") {
      return NextResponse.json(await getCountries());
    }

    // Return distinct regions, optionally filtered by country
    if (searchParams.get("regions") === "true") {
      const country = searchParams.get("country") || undefined;
      return NextResponse.json(await getRegions(country));
    }

    // Legacy: return counties
    if (searchParams.get("counties") === "true") {
      return NextResponse.json(await getCounties());
    }

    // Get user speed for duration estimates
    let userSpeed = DEFAULT_SPEED_KMH;
    const sessionToken = request.cookies.get("session")?.value;
    if (sessionToken) {
      const user = await getUserBySession(sessionToken);
      if (user?.avg_speed_kmh) {
        userSpeed = user.avg_speed_kmh;
      }
    }

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = ROUTES_PER_PAGE;

    const filters = {
      county: searchParams.get("county") || undefined,
      country: searchParams.get("country") || undefined,
      discipline: searchParams.get("discipline") || undefined,
      surface_type: searchParams.get("surface_type") || undefined,
      search: searchParams.get("search") || undefined,
      sort: searchParams.get("sort") || undefined,
      verified: searchParams.get("verified") === "true" ? true : undefined,
      lat: searchParams.get("lat") ? Number(searchParams.get("lat")) : undefined,
      lng: searchParams.get("lng") ? Number(searchParams.get("lng")) : undefined,
      duration: searchParams.get("duration") || undefined,
      avgSpeedKmh: userSpeed,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    };

    const rows = await getRoutes(filters);
    const hasMore = rows.length > pageSize;
    const routes = hasMore ? rows.slice(0, pageSize) : rows;
    return NextResponse.json({ data: routes, hasMore, page, avgSpeedKmh: userSpeed });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Require authenticated user
    const sessionToken = request.cookies.get("session")?.value;
    if (!sessionToken) {
      return apiError("Sign in to upload routes", "UNAUTHORIZED", 401);
    }
    const currentUser = await getUserBySession(sessionToken);
    if (!currentUser) {
      return apiError("Sign in to upload routes", "UNAUTHORIZED", 401);
    }
    if (
      currentUser.role !== "admin" &&
      !(await hasActiveBetaAccess(currentUser.id, "contributor"))
    ) {
      return apiError(
        "Founding contributor access is required before submitting a route",
        "CONTRIBUTOR_ACCESS_REQUIRED",
        403
      );
    }

    const formData = await request.formData();
    const name = formData.get("name") as string;
    const description = formData.get("description") as string | null;
    const surfaceType = formData.get("surface_type") as string;
    const county = formData.get("county") as string;
    const country = (formData.get("country") as string) || DEFAULT_COUNTRY;
    const region = (formData.get("region") as string) || county || null;
    const discipline = (formData.get("discipline") as string) || PUBLIC_DISCIPLINE;

    if (!name || !surfaceType || !county) {
      return apiError("Missing required fields", "VALIDATION_ERROR", 400);
    }

    if (name.length > MAX_ROUTE_NAME_LENGTH) {
      return apiError(`Route name must be ${MAX_ROUTE_NAME_LENGTH} characters or less`, "VALIDATION_ERROR", 400);
    }

    if (description && description.length > MAX_ROUTE_DESCRIPTION_LENGTH) {
      return apiError(`Description must be ${MAX_ROUTE_DESCRIPTION_LENGTH} characters or less`, "VALIDATION_ERROR", 400);
    }

    if (!(DISCIPLINES as readonly string[]).includes(discipline)) {
      return apiError(`Discipline must be ${DISCIPLINES.join(", ")}`, "VALIDATION_ERROR", 400);
    }

    if (discipline !== PUBLIC_DISCIPLINE) {
      return apiError("The Ireland beta currently accepts road routes only.", "OUT_OF_LAUNCH_SCOPE", 400);
    }

    if (surfaceType !== PUBLIC_SURFACE_TYPE) {
      return apiError("The Ireland beta currently accepts paved road routes only.", "OUT_OF_LAUNCH_SCOPE", 400);
    }

    if (country !== ACTIVE_LAUNCH_MARKET.country) {
      return apiError("The contributor beta is currently open for Ireland only.", "OUT_OF_LAUNCH_SCOPE", 400);
    }

    if (!currentUser.name?.trim()) {
      return apiError("Add your real name to your profile before submitting a ridden route.", "RIDER_NAME_REQUIRED", 400);
    }

    let prepared;
    try {
      prepared = await prepareRideSubmission(formData);
    } catch (error) {
      if (error instanceof RouteSubmissionError) {
        return apiError(error.message, error.code, error.status);
      }
      throw error;
    }

    const id = uuidv4();

    const route = await createRiddenRouteSubmission({
      id,
      name,
      description: description || null,
      distance_km: prepared.distanceKm,
      elevation_gain_m: prepared.elevationGainM,
      elevation_loss_m: prepared.elevationLossM,
      surface_type: surfaceType as "gravel" | "mixed" | "trail" | "road" | "singletrack" | "technical",
      county,
      country,
      region,
      discipline: discipline as "road" | "gravel" | "mtb",
      start_lat: prepared.coordinatePairs[0][0],
      start_lng: prepared.coordinatePairs[0][1],
      gpx_filename: prepared.routeFileName,
      coordinates: prepared.coordinates,
      created_by: currentUser.id,
      strava_activity_id: null,
      quality_status: "pending",
      publication_status: "draft",
    }, {
      userId: currentUser.id,
      riderName: currentUser.name.trim(),
      riddenAt: prepared.riddenAt,
      evidenceType: prepared.evidenceType,
      evidenceReference: prepared.routeFileName,
      sourcePlatform: prepared.sourcePlatform,
      sourceReference: prepared.sourceReference,
      evidenceFileHash: prepared.evidenceFileHash,
      evidenceStartedAt: prepared.evidenceStartedAt,
      evidenceEndedAt: prepared.evidenceEndedAt,
      evidencePointCount: prepared.evidencePointCount,
      evidenceTimestampedPointCount: prepared.evidenceTimestampedPointCount,
      coordinates: prepared.coordinates,
      distanceKm: prepared.distanceKm,
      elevationGainM: prepared.elevationGainM,
      elevationLossM: prepared.elevationLossM,
    });

    return NextResponse.json(route, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
