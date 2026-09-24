import { ImageResponse } from "next/og";
import { getRoute } from "@/lib/db";
import { withAutoTitle } from "@/lib/route-title";
import { estimateRideMinutes, formatRideTime } from "@/lib/ride-time";
import { formatRideWhen, cleanMeet } from "@/lib/ride-invite";
import { getOgFonts } from "@/lib/og-fonts";

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
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const stored = await getRoute(id);
    const route = stored ? withAutoTitle(stored) : stored;

    if (!route) {
      return fallbackImage("Route not found");
    }

    // Group-ride invite details (from /ride/<id>?t=…&m=…).
    const sp = new URL(request.url).searchParams;
    const when = formatRideWhen(sp.get("t"));
    const meet = cleanMeet(sp.get("m"));
    const isVerified = route.is_verified === 1;

    // Parse coordinates and normalize for SVG path
    let svgPath = "";
    try {
      const raw: [number, number][] = JSON.parse(route.coordinates);
      // Routes carry up to 8,000 points; rendering them all into a
      // 320px thumbnail made Satori time out on long routes (broken
      // images on the homepage). ~150 points is visually identical.
      const MAX_PTS = 150;
      const step = Math.max(1, Math.floor(raw.length / MAX_PTS));
      const coords = raw.filter((_, i) => i % step === 0 || i === raw.length - 1);
      if (coords.length > 1) {
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        for (const c of coords) {
          if (c[0] < minLat) minLat = c[0];
          if (c[0] > maxLat) maxLat = c[0];
          if (c[1] < minLng) minLng = c[1];
          if (c[1] > maxLng) maxLng = c[1];
        }
        // True proportions: one scale for both axes, longitude shrunk by
        // cos(latitude) (it was stretched to a square before).
        const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
        const spanX = (maxLng - minLng) * kx || 0.001;
        const spanY = maxLat - minLat || 0.001;
        const padding = 30;
        const size = 320;
        const scale = (size - padding * 2) / Math.max(spanX, spanY);
        const offX = (size - spanX * scale) / 2;
        const offY = (size - spanY * scale) / 2;

        const points = coords.map((c) => {
          const x = offX + (c[1] - minLng) * kx * scale;
          const y = offY + (maxLat - c[0]) * scale;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        svgPath = `M${points.join("L")}`;
      }
    } catch {
      // ignore parse errors
    }

    // Real bold weights (Inter); undefined → next/og's default font.
    const fonts = await getOgFonts();

    return new ImageResponse(
      (
        <div
          style={{
            width: "1200px",
            height: "630px",
            display: "flex",
            background: "#0a0a0a",
            fontFamily: "Inter, sans-serif",
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
                {when ? (
                  <span
                    style={{
                      fontSize: "22px",
                      fontWeight: 800,
                      color: "#0a0a0a",
                      background: "#c8ff00",
                      padding: "6px 14px",
                      borderRadius: "8px",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {`Group ride · ${when}`}
                  </span>
                ) : isVerified ? (
                  <span
                    style={{
                      fontSize: "16px",
                      fontWeight: 700,
                      color: "#00ff88",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.1em",
                      padding: "4px 12px",
                      borderRadius: "6px",
                      background: "rgba(0, 255, 136, 0.12)",
                    }}
                  >
                    Verified route
                  </span>
                ) : null}
                {/* Road Standard badge — the Trust Rule, visible in the chat preview */}
                {route.road_report && typeof route.road_report.standard_met === "boolean" ? (
                  <span
                    style={{
                      fontSize: "16px",
                      fontWeight: 700,
                      color: route.road_report.standard_met ? "#c8ff00" : "#f5a524",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.08em",
                      padding: "5px 12px",
                      borderRadius: "6px",
                      background: route.road_report.standard_met ? "rgba(200, 255, 0, 0.12)" : "rgba(245, 165, 36, 0.14)",
                    }}
                  >
                    {route.road_report.standard_met ? "Road Standard: met" : "Road notes on route"}
                  </span>
                ) : null}
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

              <div style={{ display: "flex", gap: "24px", fontSize: "26px" }}>
                <span style={{ color: "#c8ff00", fontWeight: 700 }}>
                  {route.distance_km} km
                </span>
                <span style={{ color: "#a0a0a0" }}>
                  {`${route.elevation_gain_m} m climbing`}
                </span>
                <span style={{ color: "#a0a0a0" }}>
                  {`${formatRideTime(estimateRideMinutes({ distance_km: Number(route.distance_km), elevation_gain_m: Number(route.elevation_gain_m), discipline: route.discipline }), { style: "card" })} riding`}
                </span>
              </div>
            </div>

            {/* Bottom: meeting point (ride invite) or place */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: meet ? "26px" : "20px", color: meet ? "#f5f5f5" : "#888888", fontWeight: meet ? 700 : 400 }}>
                {meet ? `Meet: ${meet}` : `${route.region || route.county}, ${route.country || "Ireland"}`}
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
        ...(fonts ? { fonts } : {}),
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
