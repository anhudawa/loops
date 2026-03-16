import { NextRequest, NextResponse } from "next/server";
import { getRoute, getUserBySession, trackDownload, migrateDb } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication to download GPX
    const sessionToken = request.cookies.get("session")?.value;
    if (!sessionToken) {
      return apiError("Sign in to download routes", "UNAUTHORIZED", 401);
    }
    const user = await getUserBySession(sessionToken);
    if (!user) {
      return apiError("Sign in to download routes", "UNAUTHORIZED", 401);
    }

    const { id } = await params;
    const route = await getRoute(id);

    if (!route) {
      return apiError("Route not found", "NOT_FOUND", 404);
    }

    // Track download
    try {
      await migrateDb();
      await trackDownload(uuidv4(), id, user.id);
    } catch {
      // Don't block the download if tracking fails
    }

    // Generate GPX from stored coordinates (may be [lat,lng] or [lat,lng,ele])
    const coordinates: number[][] = JSON.parse(route.coordinates);
    const gpx = generateGpx(route.name, route.description, coordinates);

    return new NextResponse(gpx, {
      headers: {
        "Content-Type": "application/gpx+xml",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(route.name)}.gpx"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

function generateGpx(
  name: string,
  description: string | null,
  coordinates: number[][]
): string {
  const trkpts = coordinates
    .map((coord) => {
      const [lat, lng, ele] = coord;
      const eleTag = ele != null ? `<ele>${ele}</ele>` : "";
      return `      <trkpt lat="${lat}" lon="${lng}">${eleTag}</trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LOOPS"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>
${description ? `    <desc>${escapeXml(description)}</desc>\n` : ""}    <link href="https://loops.ie">
      <text>LOOPS</text>
    </link>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
