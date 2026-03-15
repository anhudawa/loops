import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const [statsResult, featuredResult, communityResult] = await Promise.all([
      sql`
        SELECT COUNT(*) as count, COALESCE(SUM(distance_km), 0) as total_km,
          COUNT(DISTINCT region) as regions, COUNT(DISTINCT country) as countries
        FROM routes
      `,
      sql`
        SELECT r.id, r.name, r.distance_km, r.surface_type, r.country,
          r.discipline, r.coordinates,
          COALESCE(AVG(rt.score), 0) as avg_score,
          COUNT(rt.id) as rating_count,
          (SELECT p.filename FROM photos p WHERE p.route_id = r.id ORDER BY p.created_at LIMIT 1) as cover_photo
        FROM routes r
        LEFT JOIN ratings rt ON rt.route_id = r.id
        GROUP BY r.id
        HAVING COUNT(rt.id) >= 1
        ORDER BY COALESCE(AVG(rt.score), 0) DESC, COUNT(rt.id) DESC
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
      community: {
        riders: Number(community.riders),
        comments: Number(community.comments),
        ratings: Number(community.ratings),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
