import { ImageResponse } from "next/og";

export const runtime = "nodejs";

/**
 * Default OG image for the home / login page.
 * 1200×630, matches the brand style.
 */
export async function GET() {
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
          position: "relative",
        }}
      >
        {/* Subtle glow */}
        <div
          style={{
            position: "absolute",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(200, 255, 0, 0.06) 0%, transparent 70%)",
          }}
        />

        {/* Ring */}
        <svg
          width="200"
          height="200"
          viewBox="0 0 200 200"
          style={{ position: "absolute", opacity: 0.08 }}
        >
          <circle
            cx="100"
            cy="100"
            r="80"
            fill="none"
            stroke="#c8ff00"
            strokeWidth="16"
          />
        </svg>

        {/* Logo */}
        <span
          style={{
            fontSize: "96px",
            fontWeight: 900,
            color: "#c8ff00",
            letterSpacing: "4px",
            textTransform: "uppercase" as const,
            position: "relative",
          }}
        >
          LOOPS
        </span>

        {/* Tagline */}
        <span
          style={{
            fontSize: "28px",
            fontWeight: 600,
            color: "#a0a0a0",
            marginTop: "16px",
            letterSpacing: "0.05em",
            position: "relative",
          }}
        >
          Stop riding the same loop
        </span>

        {/* Sub */}
        <span
          style={{
            fontSize: "18px",
            color: "#666",
            marginTop: "12px",
            position: "relative",
          }}
        >
          Discover & share gravel, road & MTB routes worldwide
        </span>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=604800, s-maxage=604800",
      },
    }
  );
}
