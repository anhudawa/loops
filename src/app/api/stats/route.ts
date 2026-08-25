import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET() {
  try {
    const [statsResult, featuredResult] = await Promise.all([
      sql`
        SELECT COUNT(*) as count, COALESCE(SUM(distance_km), 0) as total_km,
          COUNT(DISTINCT region) as regions, COUNT(DISTINCT country) as countries
        FROM routes
        WHERE discipline = 'road'
          AND surface_type = 'road'
          AND country = 'Ireland'
          AND publication_status = 'published'
          AND human_ridden = TRUE
          AND last_ridden_at >= CURRENT_DATE - INTERVAL '365 days'
          AND rights_confirmed_at IS NOT NULL
          AND current_version_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM ride_attestations ra
            WHERE ra.route_id = routes.id
              AND ra.route_version_id = routes.current_version_id
              AND ra.review_status = 'approved'
              AND ra.rights_granted_at IS NOT NULL
          )
          AND EXISTS (
            SELECT 1 FROM route_reviews rr
            WHERE rr.route_id = routes.id
              AND rr.route_version_id = routes.current_version_id
              AND rr.decision = 'approved'
          )
      `,
      sql`
        SELECT r.id, r.name, r.distance_km, r.surface_type, r.country,
          r.discipline, r.coordinates,
          COALESCE(AVG(rt.score), 0) as avg_score,
          COUNT(rt.id) as rating_count,
          (SELECT p.filename FROM photos p WHERE p.route_id = r.id ORDER BY p.created_at LIMIT 1) as cover_photo
        FROM routes r
        LEFT JOIN ratings rt ON rt.route_id = r.id
        WHERE r.discipline = 'road'
          AND r.surface_type = 'road'
          AND r.country = 'Ireland'
          AND r.publication_status = 'published'
          AND r.human_ridden = TRUE
          AND r.last_ridden_at >= CURRENT_DATE - INTERVAL '365 days'
          AND r.rights_confirmed_at IS NOT NULL
          AND r.current_version_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM ride_attestations ra
            WHERE ra.route_id = r.id
              AND ra.route_version_id = r.current_version_id
              AND ra.review_status = 'approved'
              AND ra.rights_granted_at IS NOT NULL
          )
          AND EXISTS (
            SELECT 1 FROM route_reviews rr
            WHERE rr.route_id = r.id
              AND rr.route_version_id = r.current_version_id
              AND rr.decision = 'approved'
          )
        GROUP BY r.id
        HAVING COUNT(rt.id) >= 1
        ORDER BY COALESCE(AVG(rt.score), 0) DESC, COUNT(rt.id) DESC
        LIMIT 3
      `,
    ]);

    const row = statsResult.rows[0];

    return NextResponse.json({
      routes: Number(row.count),
      totalKm: Math.round(Number(row.total_km)),
      regions: Number(row.regions),
      countries: Number(row.countries),
      counties: Number(row.regions),
      featuredRoutes: featuredResult.rows.map((r) => ({
        id: r.id,
        name: r.name,
        distance_km: Number(r.distance_km),
        surface_type: r.surface_type,
        country: r.country,
        discipline: r.discipline,
        avg_score: Math.round(Number(r.avg_score) * 10) / 10,
        rating_count: Number(r.rating_count),
        cover_photo: r.cover_photo,
      })),
    });
  } catch {
    // DB down: return nulls with 200 so consumer consoles stay clean —
    // the UI guards against null stats already.
    return NextResponse.json(
      { routes: null, totalKm: null, countries: null, featuredRoutes: [] },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  }
}
