import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET() {
  const { rows } = await sql`
    SELECT COUNT(*) as count, COALESCE(SUM(distance_km), 0) as total_km,
      COUNT(DISTINCT region) as regions, COUNT(DISTINCT country) as countries
    FROM routes
  `;
  const row = rows[0];

  return NextResponse.json({
    routes: Number(row.count),
    totalKm: Math.round(Number(row.total_km)),
    regions: Number(row.regions),
    countries: Number(row.countries),
    counties: Number(row.regions),
  });
}
