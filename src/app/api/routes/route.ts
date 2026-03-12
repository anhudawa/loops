import { NextRequest, NextResponse } from "next/server";
import { getRoutes, insertRoute, getCounties } from "@/lib/db";
import { parseGpx } from "@/lib/gpx";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get("counties") === "true") {
    return NextResponse.json(await getCounties());
  }

  const filters = {
    difficulty: searchParams.get("difficulty") || undefined,
    minDistance: searchParams.get("minDistance") ? Number(searchParams.get("minDistance")) : undefined,
    maxDistance: searchParams.get("maxDistance") ? Number(searchParams.get("maxDistance")) : undefined,
    county: searchParams.get("county") || undefined,
    surface_type: searchParams.get("surface_type") || undefined,
    search: searchParams.get("search") || undefined,
    sort: searchParams.get("sort") || undefined,
    verified: searchParams.get("verified") === "true" ? true : undefined,
  };

  const routes = await getRoutes(filters);
  return NextResponse.json(routes);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const gpxFile = formData.get("gpx") as File | null;
  const name = formData.get("name") as string;
  const description = formData.get("description") as string | null;
  const difficulty = formData.get("difficulty") as string;
  const surfaceType = formData.get("surface_type") as string;
  const county = formData.get("county") as string;

  if (!name || !difficulty || !surfaceType || !county) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (gpxFile) {
    const gpxText = await gpxFile.text();
    const parsed = parseGpx(gpxText);
    const coordinates = parsed.coordinates;
    const distance_km = parsed.distance_km;
    const elevation_gain_m = parsed.elevation_gain_m;
    const elevation_loss_m = parsed.elevation_loss_m;

    if (coordinates.length === 0) {
      return NextResponse.json({ error: "Could not parse GPX file - no track points found" }, { status: 400 });
    }

    const id = uuidv4();

    const route = await insertRoute({
      id,
      name,
      description: description || null,
      difficulty: difficulty as "easy" | "moderate" | "hard" | "expert",
      distance_km,
      elevation_gain_m,
      elevation_loss_m,
      surface_type: surfaceType as "gravel" | "mixed" | "trail" | "road",
      county,
      start_lat: coordinates[0][0],
      start_lng: coordinates[0][1],
      gpx_filename: null,
      coordinates: JSON.stringify(coordinates),
      created_by: null,
    });

    return NextResponse.json(route, { status: 201 });
  }

  return NextResponse.json({ error: "GPX file is required" }, { status: 400 });
}
