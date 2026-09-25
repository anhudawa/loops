import { ImageResponse } from "next/og";
import { getRoute } from "@/lib/db";
import { withAutoTitle } from "@/lib/route-title";
import { withTrueClimb } from "@/lib/true-climb";
import { estimateRideMinutes, formatRideTime } from "@/lib/ride-time";
import { formatRideWhen, cleanMeet } from "@/lib/ride-invite";
import { getOgFonts } from "@/lib/og-fonts";

export const runtime = "nodejs";

/**
 * GET /api/og/<id>/story?t=YYYY-MM-DDTHH:MM&m=<meet>
 *
 * A 1080×1920 Instagram-story card for a group ride: the loop, when and
 * where, the numbers, and the call — "Are you riding or are you hiding?".
 * Everything that matters sits inside Instagram's safe area (clear of the
 * top ~250 px and bottom ~300 px where its own controls go); the ride link
 * travels in the story's link sticker (the share sheet copies it).
 */
const W = 1080, H = 1920;
const ACCENT = "#c8ff00";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const stored = await getRoute(id);
    const route = stored ? withTrueClimb(withAutoTitle(stored)) : stored;
    const sp = new URL(request.url).searchParams;
    const when = formatRideWhen(sp.get("t"));
    const meet = cleanMeet(sp.get("m"));
    const fonts = await getOgFonts();

    if (!route) {
      return new ImageResponse(
        (
          <div style={{ width: `${W}px`, height: `${H}px`, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: ACCENT, fontSize: "96px", fontWeight: 900 }}>
            LOOPS
          </div>
        ),
        { width: W, height: H, fonts },
      );
    }

    // The loop drawn to true proportions, ~150 points (Satori-safe).
    const SIZE = 720;
    let svgPath = "";
    let start: [number, number] | null = null;
    try {
      const raw: [number, number][] = JSON.parse(route.coordinates);
      const step = Math.max(1, Math.floor(raw.length / 150));
      const coords = raw.filter((_, i) => i % step === 0 || i === raw.length - 1);
      if (coords.length > 1) {
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        for (const c of coords) {
          minLat = Math.min(minLat, c[0]); maxLat = Math.max(maxLat, c[0]);
          minLng = Math.min(minLng, c[1]); maxLng = Math.max(maxLng, c[1]);
        }
        const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
        const spanX = (maxLng - minLng) * kx || 0.001, spanY = maxLat - minLat || 0.001;
        const pad = 60;
        const scale = (SIZE - pad * 2) / Math.max(spanX, spanY);
        const offX = (SIZE - spanX * scale) / 2, offY = (SIZE - spanY * scale) / 2;
        const pts = coords.map((c) => [offX + (c[1] - minLng) * kx * scale, offY + (maxLat - c[0]) * scale] as [number, number]);
        svgPath = `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}`;
        start = pts[0];
      }
    } catch { /* no track: the card still says when and where */ }

    const km = Number(route.distance_km);
    const climb = Number(route.elevation_gain_m);
    const time = formatRideTime(estimateRideMinutes({ distance_km: km, elevation_gain_m: climb, discipline: route.discipline }), { style: "card" });
    const standard = route.road_report && typeof route.road_report.standard_met === "boolean" ? route.road_report.standard_met : null;

    return new ImageResponse(
      (
        <div style={{ width: `${W}px`, height: `${H}px`, display: "flex", flexDirection: "column", alignItems: "center", background: "#0a0a0a", fontFamily: "Inter, sans-serif", padding: "260px 80px 320px" }}>
          {/* The call */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <span style={{ fontSize: "78px", fontWeight: 900, color: "#f5f5f5", lineHeight: 1.05, letterSpacing: "-2px" }}>Are you riding</span>
            <span style={{ fontSize: "78px", fontWeight: 900, color: ACCENT, lineHeight: 1.05, letterSpacing: "-2px" }}>or are you hiding?</span>
          </div>

          {/* When + where */}
          {(when || meet) && (
            <div style={{ display: "flex", alignItems: "center", marginTop: "44px", padding: "20px 36px", borderRadius: "999px", background: ACCENT, color: "#0a0a0a", fontSize: "36px", fontWeight: 900, lineHeight: 1.2 }}>
              {[when, meet ? `Meet: ${meet}` : null].filter(Boolean).join(" · ")}
            </div>
          )}

          {/* The loop */}
          <div style={{ display: "flex", marginTop: "40px", width: `${SIZE}px`, height: `${SIZE}px`, borderRadius: "48px", background: "#141414", border: "2px solid #262626" }}>
            {svgPath ? (
              <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                <path d={svgPath} fill="none" stroke={ACCENT} strokeWidth="26" strokeOpacity="0.18" strokeLinejoin="round" strokeLinecap="round" />
                <path d={svgPath} fill="none" stroke={ACCENT} strokeWidth="10" strokeLinejoin="round" strokeLinecap="round" />
                {start && <circle cx={start[0]} cy={start[1]} r="20" fill="#0a0a0a" stroke={ACCENT} strokeWidth="8" />}
              </svg>
            ) : null}
          </div>

          {/* Name + numbers */}
          <div style={{ display: "flex", marginTop: "40px", maxWidth: "920px", justifyContent: "center", textAlign: "center", fontSize: route.name.length > 32 ? "44px" : "52px", fontWeight: 800, color: "#f5f5f5", lineHeight: 1.12 }}>{route.name}</div>
          <div style={{ display: "flex", marginTop: "22px", gap: "36px", fontSize: "44px", fontWeight: 800 }}>
            <span style={{ color: ACCENT }}>{`${Math.round(km * 10) / 10} km`}</span>
            <span style={{ color: "#d4d4d4" }}>{`+${Math.round(climb)} m`}</span>
            <span style={{ color: "#d4d4d4" }}>{time}</span>
          </div>
          {standard !== null && (
            <span style={{ marginTop: "22px", fontSize: "30px", fontWeight: 700, color: standard ? ACCENT : "#f5a524" }}>
              {standard ? "Quiet roads · meets the LOOPS Road Standard" : "Road notes on the route page"}
            </span>
          )}

          {/* Sign-off (above Instagram's reply bar) */}
          <div style={{ display: "flex", marginTop: "48px", alignItems: "center", gap: "20px" }}>
            <span style={{ fontSize: "46px", fontWeight: 900, color: "#f5f5f5", letterSpacing: "2px" }}>LOOPS</span>
            <span style={{ fontSize: "32px", color: "#a3a3a3" }}>loops.ie</span>
          </div>
        </div>
      ),
      { width: W, height: H, fonts, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
    );
  } catch (err) {
    console.error("[og/story]", err instanceof Error ? err.message : err);
    return new Response("Story image unavailable", { status: 500 });
  }
}
