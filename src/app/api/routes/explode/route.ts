import { NextRequest, NextResponse } from "next/server";
import { explodeRoute, type Discipline, type VariantType } from "@/lib/route-explosion";
import { getRoute } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { DISCIPLINES } from "@/config/constants";
import { ALLOW_FRESH_PUBLIC_ROUTE_GENERATION } from "@/config/route-policy";

/**
 * POST /api/routes/explode
 *
 * Generate route variations from a proven base route.
 *
 * Body (JSON):
 *   { routeId: string }  – explode an existing stored route
 *   { coordinates: [lat, lng, ele?][], name: string, discipline: string, distance_km: number }
 *
 * Optional:
 *   { maxVariants: number }       – cap on variants returned (default 10)
 *   { includeTypes: string[] }    – filter variant types:
 *                                   "reverse" | "start_shift" | "distance_trim" | "nearby_variant"
 *
 * Response:
 *   { data: RouteVariant[] }
 */
export async function POST(request: NextRequest) {
  if (!ALLOW_FRESH_PUBLIC_ROUTE_GENERATION) {
    return apiError(
      "Unridden route variants are unavailable during the Ireland beta.",
      "ROUTE_VARIANTS_DISABLED",
      410
    );
  }

  try {
    const body = await request.json() as {
      routeId?: string;
      coordinates?: [number, number, number?][];
      name?: string;
      discipline?: string;
      distance_km?: number;
      maxVariants?: number;
      includeTypes?: string[];
    };

    let coordinates: [number, number, number?][];
    let discipline: Discipline;
    let name: string;
    let distance_km: number;

    // ── Resolve input ──────────────────────────────────────────────────────────
    if (body.routeId) {
      const route = await getRoute(body.routeId);
      if (!route) return apiError("Route not found", "NOT_FOUND", 404);

      const raw = JSON.parse(route.coordinates as string) as number[][];
      coordinates = raw.map((c) => (c[2] !== undefined ? [c[0], c[1], c[2]] : [c[0], c[1]]) as [number, number, number?]);
      discipline = (route.discipline ?? "road") as Discipline;
      name = route.name as string;
      distance_km = route.distance_km as number;
    } else if (body.coordinates) {
      if (!Array.isArray(body.coordinates) || body.coordinates.length < 10) {
        return apiError("coordinates must be an array of at least 10 points", "INVALID_INPUT", 400);
      }
      if (!body.name) return apiError("name is required when providing coordinates", "INVALID_INPUT", 400);

      coordinates = body.coordinates;
      discipline = DISCIPLINES.includes(body.discipline as Discipline)
        ? (body.discipline as Discipline)
        : "road";
      name = body.name.slice(0, 200);
      distance_km = typeof body.distance_km === "number" ? body.distance_km : 0;
    } else {
      return apiError("Provide either routeId or coordinates", "INVALID_INPUT", 400);
    }

    // ── Validate options ───────────────────────────────────────────────────────
    const maxVariants = Math.min(
      typeof body.maxVariants === "number" ? body.maxVariants : 10,
      20
    );

    const validTypes: VariantType[] = ["reverse", "start_shift", "distance_trim", "nearby_variant"];
    const includeTypes = Array.isArray(body.includeTypes)
      ? (body.includeTypes.filter((t): t is VariantType => validTypes.includes(t as VariantType)))
      : undefined;

    // ── Generate variants ──────────────────────────────────────────────────────
    const variants = await explodeRoute(
      { name, coordinates, discipline, distance_km },
      { maxVariants, includeTypes }
    );

    return NextResponse.json({ data: variants });
  } catch (err) {
    return handleApiError(err);
  }
}
