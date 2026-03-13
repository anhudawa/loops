import { NextRequest, NextResponse } from "next/server";
import { getRoutes, insertRoute, getCounties, getRegions, getCountries, getUserBySession } from "@/lib/db";
import { parseGpx } from "@/lib/gpx";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
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
}

export async function POST(request: NextRequest) {
  // Require authenticated user
  const sessionToken = request.cookies.get("session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Sign in to upload routes" }, { status: 401 });
  }
  const currentUser = await getUserBySession(sessionToken);
  if (!currentUser) {
    return NextResponse.json({ error: "Sign in to upload routes" }, { status: 401 });
  }

  const formData = await request.formData();
  const gpxFile = formData.get("gpx") as File | null;
  const name = formData.get("name") as string;
  const description = formData.get("description") as string | null;
  const difficulty = formData.get("difficulty") as string;
  const surfaceType = formData.get("surface_type") as string;
  const county = formData.get("county") as string;
  const country = (formData.get("country") as string) || "Ireland";
  const region = (formData.get("region") as string) || county || null;
  const discipline = (formData.get("discipline") as string) || "gravel";

  if (!name || !difficulty || !surfaceType || !county) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (gpxFile) {
    const gpxText = await gpxFile.text();
    const parsed = parseGpx(gpxText);
    const { coordinates, elevations, distance_km, elevation_gain_m, elevation_loss_m } = parsed;

    if (coordinates.length === 0) {
      return NextResponse.json({ error: "Could not parse GPX file - no track points found" }, { status: 400 });
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
  }

  return NextResponse.json({ error: "GPX file is required" }, { status: 400 });
}
