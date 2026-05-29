import { ImageResponse } from "next/og";
import polyline from "@mapbox/polyline";

export const runtime = "nodejs";

const DISCIPLINE_COLORS: Record<string, string> = {
  road: "#ffbb00",
  gravel: "#ff6633",
  mtb: "#bb44ff",
};

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const coordsParam = searchParams.get("coords");
    const distance = searchParams.get("distance") || "0";
    const elevation = searchParams.get("elevation") || "0";
    const discipline = searchParams.get("discipline") || "road";
    const name = searchParams.get("name") || "Generated Route";

    if (!coordsParam) {
      return fallbackImage("Route preview");
    }

    let coords: [number, number][];
    try {
      coords = polyline.decode(coordsParam);
    } catch {
      return fallbackImage("Route preview");
    }

    if (coords.length < 2) {
      return fallbackImage("Route preview");
    }

    const color = DISCIPLINE_COLORS[discipline] || "#c8ff00";

    const lats = coords.map((c) => c[0]);
    const lngs = coords.map((c) => c[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const rangeX = maxLng - minLng || 0.01;
    const rangeY = maxLat - minLat || 0.01;
    const padding = 50;
    const svgW = 480;
    const svgH = 480;

    const points = coords.map((c) => {
      const x = padding + ((c[1] - minLng) / rangeX) * (svgW - padding * 2);
      const y = padding + ((maxLat - c[0]) / rangeY) * (svgH - padding * 2);
      return `${x},${y}`;
    });
    const svgPath = `M${points.join("L")}`;

    const startX = points[0].split(",")[0];
    const startY = points[0].split(",")[1];

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
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "60px",
            }}
          >
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

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  color,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.1em",
                  padding: "4px 12px",
                  borderRadius: "6px",
                  background: `${color}20`,
                  alignSelf: "flex-start",
                }}
              >
                {discipline}
              </span>

              <h1
                style={{
                  fontSize: "44px",
                  fontWeight: 800,
                  color: "#f5f5f5",
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                  margin: 0,
                }}
              >
                {name.length > 40 ? name.slice(0, 40) + "..." : name}
              </h1>

              <div style={{ display: "flex", gap: "24px", fontSize: "20px" }}>
                <span style={{ color: "#c8ff00", fontWeight: 700 }}>
                  {distance} km
                </span>
                <span style={{ color: "#a0a0a0" }}>
                  ↑ {elevation}m
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px", color: "#666666" }}>
                loops.ie/generate
              </span>
            </div>
          </div>

          <div
            style={{
              width: "520px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                width: "400px",
                height: "400px",
                borderRadius: "50%",
                background: `radial-gradient(circle, ${color}14 0%, transparent 70%)`,
              }}
            />
            <svg
              width={svgW}
              height={svgH}
              viewBox={`0 0 ${svgW} ${svgH}`}
              style={{ position: "relative" }}
            >
              <path
                d={svgPath}
                fill="none"
                stroke={color}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={startX}
                cy={startY}
                r="8"
                fill={color}
              />
            </svg>
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
    console.error("Generated route OG image error:", error);
    return fallbackImage("Plan your ride on LOOPS");
  }
}
