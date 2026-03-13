import { NextRequest, NextResponse } from "next/server";
import { getRoutes, insertRoute, getCounties, getRegions, getCountries, getUserBySession } from "@/lib/db";
import { parseRouteFile } from "@/lib/route-parser";
import { fetchRideWithGPS } from "@/lib/ridewithgps";
import { validateStravaUrl, getStravaExportError } from "@/lib/strava";
import { apiError, handleApiError } from "@/lib/api-utils";
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

    const filters = {
      difficulty: searchParams.get("difficulty") || undefined,
      minDistance: searchParams.get("minDistance") ? Number(searchParams.get("minDistance")) : undefined,
      maxDistance: searchParams.get("maxDistance") ? Number(searchParams.get("maxDistance")) : undefined,
      county: searchParams.get("county") || undefined,
      country: searchParams.get("country") || undefined,
      discipline: searchParams.get("discipline") || undefined,
      surface_type: searchParams.get("surface_type") || undefined,
      search: searchParams.get("search") || undefined,
      sort: searchParams.get("sort") || undefined,
      verified: searchParams.get("verified") === "true" ? true : undefined,
      lat: searchParams.get("lat") ? Number(searchParams.get("lat")) : undefined,
      lng: searchParams.get("lng") ? Number(searchParams.get("lng")) : undefined,
      maxRadius: searchParams.get("maxRadius") ? Number(searchParams.get("maxRadius")) : undefined,
    };

    const routes = await getRoutes(filters);
    return NextResponse.json(routes);
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
    const difficulty = formData.get("difficulty") as string;
    const surfaceType = formData.get("surface_type") as string;
    const county = formData.get("county") as string;
    const country = (formData.get("country") as string) || "Ireland";
    const region = (formData.get("region") as string) || county || null;
    const discipline = (formData.get("discipline") as string) || "gravel";

    if (!name || !difficulty || !surfaceType || !county) {
      return apiError("Missing required fields", "VALIDATION_ERROR", 400);
    }

    if (name.length > 200) {
      return apiError("Route name must be 200 characters or less", "VALIDATION_ERROR", 400);
    }

    if (description && description.length > 5000) {
      return apiError("Description must be 5000 characters or less", "VALIDATION_ERROR", 400);
    }

    const validDifficulties = ["easy", "moderate", "hard", "expert"];
    if (!validDifficulties.includes(difficulty)) {
      return apiError("Difficulty must be easy, moderate, hard, or expert", "VALIDATION_ERROR", 400);
    }

    const validDisciplines = ["road", "gravel", "mtb"];
    if (!validDisciplines.includes(discipline)) {
      return apiError("Discipline must be road, gravel, or mtb", "VALIDATION_ERROR", 400);
    }

    let parsed;

    // Check for URL import
    const importUrl = formData.get("url") as string | null;
    // Check for file upload (support both "gpx" and "route_file" field names)
    const routeFile = (formData.get("route_file") as File | null) || (formData.get("gpx") as File | null);

    if (importUrl) {
      // URL import path
      if (/ridewithgps\.com\/(routes|trips)\/\d+/.test(importUrl)) {
        parsed = await fetchRideWithGPS(importUrl);
      } else if (validateStravaUrl(importUrl)) {
        return apiError(
          getStravaExportError(),
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
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      if (routeFile.size > MAX_FILE_SIZE) {
        return apiError("File must be under 10MB", "VALIDATION_ERROR", 400);
      }

      const filename = routeFile.name.toLowerCase();
      const validExtensions = [".gpx", ".fit", ".tcx"];
      if (!validExtensions.some((ext) => filename.endsWith(ext))) {
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
      difficulty: difficulty as "easy" | "moderate" | "hard" | "expert",
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
    });

    return NextResponse.json(route, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
