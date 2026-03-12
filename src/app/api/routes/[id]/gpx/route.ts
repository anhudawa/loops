import { NextRequest, NextResponse } from "next/server";
import { getRoute, getUserBySession, trackDownload, migrateDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const route = await getRoute(id);

  if (!route) {
    return NextResponse.json({ error: "Route not found" }, { status: 404 });
  }

  // Track download if user is authenticated
  const sessionToken = request.cookies.get("session")?.value;
  if (sessionToken) {
    const user = await getUserBySession(sessionToken);
    if (user) {
      try {
        await migrateDb(); // ensure downloads table exists
        await trackDownload(uuidv4(), id, user.id);
      } catch {
        // Don't block the download if tracking fails
      }
    }
  }

  // Generate GPX from stored coordinates
  const coordinates: [number, number][] = JSON.parse(route.coordinates);
  const gpx = generateGpx(route.name, route.description, coordinates);

  return new NextResponse(gpx, {
    headers: {
      "Content-Type": "application/gpx+xml",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(route.name)}.gpx"`,
    },
  });
}

function generateGpx(
  name: string,
  description: string | null,
  coordinates: [number, number][]
): string {
  const trkpts = coordinates
    .map(([lat, lng]) => `      <trkpt lat="${lat}" lon="${lng}"></trkpt>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Gravel Ireland"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>
${description ? `    <desc>${escapeXml(description)}</desc>\n` : ""}    <link href="https://gravelireland.ie">
      <text>Gravel Ireland</text>
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
