import { ImageResponse } from "next/og";
import { getRoute, getRouteRating } from "@/lib/db";

export const runtime = "nodejs";

function fallbackImage(message: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <span
          style={{
            fontSize: "72px",
            fontWeight: 900,
            color: "#c8ff00",
            letterSpacing: "4px",
          }}
        >
          LOOPS
        </span>
        <span style={{ fontSize: "24px", color: "#666", marginTop: "16px" }}>
          {message}
        </span>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    }
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const route = await getRoute(id);

    if (!route) {
      return fallbackImage("Route not found");
    }

    let rating = { average: 0, count: 0 };
    try {
      rating = await getRouteRating(id);
    } catch {
      // continue without rating
    }

    const isVerified = route.is_verified === 1;

    // Parse coordinates and normalize for SVG path
    let svgPath = "";
    try {
      const coords: [number, number][] = JSON.parse(route.coordinates);
      if (coords.length > 1) {
        const lats = coords.map((c) => c[0]);
        const lngs = coords.map((c) => c[1]);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        const rangeX = maxLng - minLng || 0.01;
        const rangeY = maxLat - minLat || 0.01;
        const padding = 40;
        const size = 320;

        const points = coords.map((c) => {
          const x = padding + ((c[1] - minLng) / rangeX) * (size - padding * 2);
          const y = padding + ((maxLat - c[0]) / rangeY) * (size - padding * 2);
          return `${x},${y}`;
        });
        svgPath = `M${points.join("L")}`;
      }
    } catch {
      // ignore parse errors
    }

    const stars = rating.count > 0 ? `${rating.average}/5` : null;

    return new ImageResponse(
      (
        <div
          style={{
            width: "1200px",
            height: "630px",
            display: "flex",
            background: "#0a0a0a",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {/* Left content */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "60px",
            }}
          >
            {/* Top: Logo */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <span
                style={{
                  fontSize: "36px",
                  fontWeight: 900,
                  color: "#f5f5f5",
                  letterSpacing: "-0.04em",
                  textTransform: "uppercase" as const,
                }}
              >
                LOOPS
              </span>
            </div>

            {/* Middle: Route info */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {stars && (
                  <span style={{ fontSize: "14px", color: "#ffbb00", fontWeight: 700 }}>
                    ★ {stars}
                  </span>
                )}
                {isVerified && (
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#00ff88",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.1em",
                      padding: "4px 12px",
                      borderRadius: "6px",
                      background: "rgba(0, 255, 136, 0.12)",
                    }}
                  >
                    ✓ Verified
                  </span>
                )}
              </div>

              <h1
                style={{
                  fontSize: "48px",
                  fontWeight: 800,
                  color: "#f5f5f5",
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                  margin: 0,
                }}
              >
                {route.name}
              </h1>

              <div style={{ display: "flex", gap: "24px", fontSize: "18px" }}>
                <span style={{ color: "#c8ff00", fontWeight: 700 }}>
                  {route.distance_km} km
                </span>
                <span style={{ color: "#a0a0a0" }}>
                  ↑ {route.elevation_gain_m}m
                </span>
                <span style={{ color: "#a0a0a0", textTransform: "capitalize" as const }}>
                  {route.surface_type}
                </span>
              </div>
            </div>

            {/* Bottom: County */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px", color: "#666666" }}>
                {route.region || route.county}, {route.country || "Ireland"}
              </span>
            </div>
          </div>

          {/* Right: Route shape */}
          <div
            style={{
              width: "420px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {/* Glow background */}
            <div
              style={{
                position: "absolute",
                width: "300px",
                height: "300px",
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(200, 255, 0, 0.08) 0%, transparent 70%)",
              }}
            />
            {svgPath && (
              <svg
                width="320"
                height="320"
                viewBox="0 0 320 320"
                style={{ position: "relative" }}
              >
                <path
                  d={svgPath}
                  fill="none"
                  stroke="#c8ff00"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Start marker */}
                <circle
                  cx={svgPath.split("M")[1]?.split(",")[0]}
                  cy={svgPath.split("M")[1]?.split(",")[1]?.split("L")[0]}
                  r="8"
                  fill="#c8ff00"
                />
              </svg>
            )}
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: {
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      }
    );
  } catch (error) {
    console.error("OG image generation error:", error);
    return fallbackImage("Routes Worth Riding");
  }
}
