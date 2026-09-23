import { NextResponse } from "next/server";
import { LAUNCH_DESTINATION_SLUGS } from "@/content/destinations";
import { sql } from "@vercel/postgres";
import { SOCIAL_FEATURES_ENABLED } from "@/config/constants";

export async function GET() {
  try {
    const [statsResult, featuredResult, communityResult] = await Promise.all([
      sql`
        SELECT COUNT(*) as count, COALESCE(SUM(distance_km), 0) as total_km,
          COUNT(DISTINCT region) as regions, COUNT(DISTINCT country) as countries
        FROM routes
      `,
      // Showcase: verified road loops from our launch countries with a
      // sensible ride length — not whatever was rated first (that surfaced
      // raw test uploads like "Karoo-Drift_Creek_Trailhead_out_&_back").
      sql`
        SELECT r.id, TRIM(r.name) as name, r.distance_km, r.surface_type, r.country,
          r.discipline,
          (SELECT p.filename FROM photos p WHERE p.route_id = r.id ORDER BY p.created_at LIMIT 1) as cover_photo
        FROM routes r
        WHERE r.verified = true
          AND r.country IN ('Spain', 'Portugal', 'Italy', 'France', 'Ireland')
          AND r.discipline = 'road'
          AND r.distance_km BETWEEN 50 AND 140
          AND r.name !~ '_'
          AND (r.quality_status = 'approved' OR r.quality_status IS NULL)
        ORDER BY r.quality_score DESC NULLS LAST, r.created_at DESC
        LIMIT 3
      `,
      sql`
        SELECT
          (SELECT COUNT(*) FROM users) as riders,
          (SELECT COUNT(*) FROM comments) as comments,
          (SELECT COUNT(*) FROM ratings) as ratings
      `,
    ]);

    const row = statsResult.rows[0];
    const community = communityResult.rows[0];

    return NextResponse.json({
      routes: Number(row.count),
      totalKm: Math.round(Number(row.total_km)),
      regions: Number(row.regions),
      // Launch destinations, not "distinct countries in the table" (which
      // counted a single USA test upload as a country).
      countries: LAUNCH_DESTINATION_SLUGS.length,
      counties: Number(row.regions),
      featuredRoutes: featuredResult.rows.map((r) => ({
        id: r.id,
        name: r.name,
        distance_km: Number(r.distance_km),
        surface_type: r.surface_type,
        country: r.country,
        discipline: r.discipline,
        cover_photo: r.cover_photo,
      })),
      // Comments and ratings are social features, hidden for launch.
      community: {
        riders: Number(community.riders),
        ...(SOCIAL_FEATURES_ENABLED
          ? { comments: Number(community.comments), ratings: Number(community.ratings) }
          : {}),
      },
    });
  } catch {
    // DB down: return nulls with 200 so consumer consoles stay clean —
    // the UI guards against null stats already.
    return NextResponse.json(
      { routes: null, totalKm: null, countries: null, featuredRoutes: [], community: null },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  }
}
