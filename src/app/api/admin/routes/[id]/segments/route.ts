import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import {
  createRouteSegmentAssessment,
  getRoute,
  getRouteSegmentAssessments,
  type SegmentAssessmentInput,
} from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { IRELAND_BETA_SESSION_TYPES, isWorkoutSessionType } from "@/lib/workout";
import { detectIntervalSegments } from "@/lib/interval-segments";
import { haversine } from "@/lib/climb-detection";

const DIRECTIONS = new Set(["forward", "reverse"]);
const SURFACE_RATINGS = new Set(["good", "mixed", "poor"]);
const TRAFFIC_RATINGS = new Set(["low", "moderate", "high"]);
const SIGHTLINE_RATINGS = new Set(["clear", "mixed", "poor"]);

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    const [route, assessments] = await Promise.all([
      getRoute(id),
      getRouteSegmentAssessments(id),
    ]);
    if (!route) return apiError("Route not found", "NOT_FOUND", 404);

    let automatedSuggestions: Array<ReturnType<typeof detectIntervalSegments>[number] & {
      start_distance_km: number;
      end_distance_km: number;
      start_coordinate: [number, number];
      end_coordinate: [number, number];
    }> = [];
    try {
      const points = JSON.parse(route.coordinates) as number[][];
      const coordinates = points.map((point): [number, number] => [point[0], point[1]]);
      const elevations = points.map((point) => typeof point[2] === "number" ? point[2] : Number.NaN);
      if (coordinates.length >= 3 && elevations.some(Number.isFinite)) {
        const cumulativeKm = [0];
        for (let index = 1; index < coordinates.length; index++) {
          cumulativeKm.push(cumulativeKm[index - 1] + haversine(coordinates[index - 1], coordinates[index]));
        }
        automatedSuggestions = detectIntervalSegments(coordinates, elevations).map((segment) => ({
          ...segment,
          start_distance_km: Math.round(cumulativeKm[segment.start_index] * 10) / 10,
          end_distance_km: Math.round(cumulativeKm[segment.end_index] * 10) / 10,
          start_coordinate: coordinates[segment.start_index],
          end_coordinate: coordinates[segment.end_index],
        }));
      }
    } catch {
      automatedSuggestions = [];
    }

    return NextResponse.json({
      assessments,
      route: {
        id: route.id,
        name: route.name,
        publication_status: route.publication_status,
        ridden_by_name: route.ridden_by_name,
        last_ridden_at: route.last_ridden_at,
      },
      automated_suggestions: automatedSuggestions,
      suggestion_notice: "Computer-generated candidates are review aids only. They are not workout claims until a human rider assessment is approved.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return apiError("Invalid JSON body", "VALIDATION_ERROR", 400);
    if (body.human_confirmation !== true) {
      return apiError(
        "Confirm that these details came from the named rider's assessment",
        "HUMAN_CONFIRMATION_REQUIRED",
        400
      );
    }

    const startIndex = finiteNumber(body.start_index);
    const endIndex = finiteNumber(body.end_index);
    const minEffortSeconds = finiteNumber(body.min_effort_seconds);
    const maxEffortSeconds = finiteNumber(body.max_effort_seconds);
    const lengthKm = finiteNumber(body.length_km);
    const avgGradient = finiteNumber(body.avg_gradient_pct);
    const maxGradient = finiteNumber(body.max_gradient_pct);
    const gradientVariance = finiteNumber(body.gradient_variance);
    const junctionCount = finiteNumber(body.junction_count);

    if (
      startIndex === null || endIndex === null ||
      !Number.isInteger(startIndex) || !Number.isInteger(endIndex) ||
      startIndex < 0 || endIndex <= startIndex ||
      minEffortSeconds === null || maxEffortSeconds === null ||
      !Number.isInteger(minEffortSeconds) || !Number.isInteger(maxEffortSeconds) ||
      minEffortSeconds < 15 || maxEffortSeconds < minEffortSeconds ||
      lengthKm === null || lengthKm <= 0 ||
      avgGradient === null || maxGradient === null ||
      gradientVariance === null || gradientVariance < 0 ||
      junctionCount === null || !Number.isInteger(junctionCount) || junctionCount < 0
    ) {
      return apiError("Invalid segment measurements", "VALIDATION_ERROR", 400);
    }
    if (!DIRECTIONS.has(body.direction)) {
      return apiError("Invalid segment direction", "VALIDATION_ERROR", 400);
    }
    if (!isWorkoutSessionType(body.session_type) || !IRELAND_BETA_SESSION_TYPES.has(body.session_type)) {
      return apiError("This session type is not available in the Ireland beta", "UNSUPPORTED_SESSION", 400);
    }
    if (!SURFACE_RATINGS.has(body.surface_rating) || !TRAFFIC_RATINGS.has(body.traffic_rating) || !SIGHTLINE_RATINGS.has(body.sightlines_rating)) {
      return apiError("Invalid safety assessment", "VALIDATION_ERROR", 400);
    }

    const entryNotes = typeof body.entry_notes === "string" ? body.entry_notes.trim() : "";
    const recoveryNotes = typeof body.recovery_notes === "string" ? body.recovery_notes.trim() : "";
    const runoutNotes = typeof body.runout_notes === "string" ? body.runout_notes.trim() : "";
    if ([entryNotes, recoveryNotes, runoutNotes].some((note) => note.length < 10)) {
      return apiError("Entry, recovery and run-out notes must each be at least 10 characters", "VALIDATION_ERROR", 400);
    }

    const input: SegmentAssessmentInput = {
      start_index: startIndex,
      end_index: endIndex,
      direction: body.direction,
      session_type: body.session_type,
      min_effort_seconds: minEffortSeconds,
      max_effort_seconds: maxEffortSeconds,
      length_km: lengthKm,
      avg_gradient_pct: avgGradient,
      max_gradient_pct: maxGradient,
      gradient_variance: gradientVariance,
      surface_rating: body.surface_rating,
      traffic_rating: body.traffic_rating,
      sightlines_rating: body.sightlines_rating,
      junction_count: junctionCount,
      entry_notes: entryNotes,
      recovery_notes: recoveryNotes,
      runout_notes: runoutNotes,
      hazards_notes: typeof body.hazards_notes === "string" ? body.hazards_notes : null,
    };
    const assessment = await createRouteSegmentAssessment(id, input, auth.user.id);
    if (!assessment) {
      return apiError(
        "Assessment requires a published current route version and approved ride attestation",
        "PROVENANCE_REQUIRED",
        409
      );
    }
    return NextResponse.json({ data: assessment }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
