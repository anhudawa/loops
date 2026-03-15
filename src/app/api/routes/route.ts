import { NextRequest, NextResponse } from "next/server";
import { getRoutes, insertRoute, getCounties, getRegions, getCountries, getUserBySession } from "@/lib/db";
import { parseRouteFile } from "@/lib/route-parser";
import { fetchRideWithGPS } from "@/lib/ridewithgps";
import { apiError, handleApiError } from "@/lib/api-utils";
import { ROUTES_PER_PAGE, MAX_ROUTE_FILE_SIZE, MAX_ROUTE_NAME_LENGTH, MAX_ROUTE_DESCRIPTION_LENGTH, DISCIPLINES, VALID_ROUTE_EXTENSIONS, DEFAULT_SPEED_KMH } from "@/config/constants";
import { getValidAccessToken, fetchActivity, fetchActivityStreams, mapStravaDiscipline } from "@/lib/strava-api";
import { calculateStats } from "@/lib/geo-utils";
import { v4 as uuidv4 } from "uuid";

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

    const formData = await request.formData();
    const name = formData.get("name") as string;
    const description = formData.get("description") as string | null;
    const surfaceType = formData.get("surface_type") as string;
    const county = formData.get("county") as string;
    const country = (formData.get("country") as string) || "Ireland";
    const region = (formData.get("region") as string) || county || null;
    const discipline = (formData.get("discipline") as string) || "gravel";

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

    let parsed;

    // Check for Strava activity import
    const stravaActivityId = formData.get("strava_activity_id") as string | null;
    // Check for URL import
    const importUrl = formData.get("url") as string | null;
    // Check for file upload (support both "gpx" and "route_file" field names)
    const routeFile = (formData.get("route_file") as File | null) || (formData.get("gpx") as File | null);

    if (stravaActivityId) {
      // Strava activity import path — fetch data server-side
      const accessToken = await getValidAccessToken(currentUser.id);
      if (!accessToken) {
        return apiError("Strava not connected. Reconnect your account and try again.", "STRAVA_NOT_CONNECTED", 400);
      }
      const activityId = Number(stravaActivityId);
      if (isNaN(activityId)) {
        return apiError("Invalid Strava activity ID", "VALIDATION_ERROR", 400);
      }
      try {
        const [activity, streams] = await Promise.all([
          fetchActivity(accessToken, activityId),
          fetchActivityStreams(accessToken, activityId),
        ]);
        const coordinates: [number, number][] = streams.latlng?.data ?? [];
        const elevations: number[] = streams.altitude?.data ?? [];
        if (coordinates.length === 0) {
          return apiError("This Strava activity has no GPS data.", "VALIDATION_ERROR", 400);
        }
        const stats = calculateStats(coordinates, elevations);
        const stravaDiscipline = mapStravaDiscipline(activity.type);
        const coordsWithElevation = coordinates.map((coord, i) => {
          const ele = elevations[i] ?? 0;
          return [coord[0], coord[1], Math.round(ele * 10) / 10];
        });
        const id = uuidv4();
        const route = await insertRoute({
          id,
          name,
          description: description || null,
          distance_km: Math.round(stats.distance_km * 10) / 10,
          elevation_gain_m: Math.round(stats.elevation_gain_m),
          elevation_loss_m: Math.round(stats.elevation_loss_m),
          surface_type: surfaceType as "gravel" | "mixed" | "trail" | "road" | "singletrack" | "technical",
          county,
          country,
          region,
          discipline: (stravaDiscipline || "road") as "road" | "gravel" | "mtb",
          start_lat: coordinates[0][0],
          start_lng: coordinates[0][1],
          gpx_filename: null,
          coordinates: JSON.stringify(coordsWithElevation),
          created_by: currentUser.id,
          strava_activity_id: activityId,
        });
        return NextResponse.json(route, { status: 201 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message === "RATE_LIMITED") {
          return apiError("Too many imports. Try again in a few minutes.", "RATE_LIMITED", 429);
        }
        return apiError("Failed to fetch activity from Strava.", "STRAVA_ERROR", 502);
      }
    } else if (importUrl) {
      // URL import path
      if (/ridewithgps\.com\/(routes|trips)\/\d+/.test(importUrl)) {
        parsed = await fetchRideWithGPS(importUrl);
      } else if (/strava\.com\/(activities|routes)\/\d+/.test(importUrl)) {
        return apiError(
          "Strava requires you to be logged in, so we can't import directly. To add this route:\n\n1. Open the activity on Strava\n2. Click the three dots (···) menu\n3. Select \"Export GPX\" or \"Export Original\"\n4. Upload the downloaded file here",
          "VALIDATION_ERROR",
          400
        );
      } else {
        return apiError(
          "Unsupported URL. Paste a RideWithGPS route link, or export from Strava as GPX/FIT and upload the file.",
          "VALIDATION_ERROR",
          400
        );
      }
    } else if (routeFile) {
      // File upload path — validate size and type
      if (routeFile.size > MAX_ROUTE_FILE_SIZE) {
        return apiError("File must be under 10MB", "VALIDATION_ERROR", 400);
      }

      const filename = routeFile.name.toLowerCase();
      if (!VALID_ROUTE_EXTENSIONS.some((ext) => filename.endsWith(ext))) {
        return apiError("Unsupported file type. Upload a .gpx, .fit, or .tcx file", "VALIDATION_ERROR", 400);
      }

      let content: string | ArrayBuffer;

      if (filename.endsWith(".fit")) {
        content = await routeFile.arrayBuffer();
      } else {
        content = await routeFile.text();
        // Basic structure validation for XML-based formats
        if (filename.endsWith(".gpx") && !content.includes("<gpx")) {
          return apiError("Invalid GPX file: missing <gpx> root element", "VALIDATION_ERROR", 400);
        }
        if (filename.endsWith(".tcx") && !content.includes("<TrainingCenterDatabase")) {
          return apiError("Invalid TCX file: missing <TrainingCenterDatabase> root element", "VALIDATION_ERROR", 400);
        }
      }

      parsed = await parseRouteFile(routeFile.name, content);
    } else {
      return apiError("Please upload a file or paste a URL", "VALIDATION_ERROR", 400);
    }

    const { coordinates, elevations, distance_km, elevation_gain_m, elevation_loss_m } = parsed;

    if (coordinates.length === 0) {
      return apiError("No track points found in the uploaded file", "VALIDATION_ERROR", 400);
    }

    // Store coordinates with elevations: [lat, lng, elevation]
    const coordsWithElevation = coordinates.map((coord, i) => {
      const ele = elevations[i] ?? 0;
      return [coord[0], coord[1], Math.round(ele * 10) / 10];
    });

    const id = uuidv4();

    const route = await insertRoute({
      id,
      name,
      description: description || null,
      distance_km,
      elevation_gain_m,
      elevation_loss_m,
      surface_type: surfaceType as "gravel" | "mixed" | "trail" | "road" | "singletrack" | "technical",
      county,
      country,
      region,
      discipline: discipline as "road" | "gravel" | "mtb",
      start_lat: coordinates[0][0],
      start_lng: coordinates[0][1],
      gpx_filename: null,
      coordinates: JSON.stringify(coordsWithElevation),
      created_by: currentUser.id,
      strava_activity_id: null,
    });

    return NextResponse.json(route, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
