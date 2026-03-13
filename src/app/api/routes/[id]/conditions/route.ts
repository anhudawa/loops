import { NextRequest, NextResponse } from "next/server";
import { getRouteConditions, insertCondition, getUserBySession } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const conditions = await getRouteConditions(id);
    return NextResponse.json(conditions);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: routeId } = await params;
    const sessionToken = request.cookies.get("session")?.value;

    if (!sessionToken) {
      return apiError("Sign in to report conditions", "UNAUTHORIZED", 401);
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      return apiError("Invalid session", "UNAUTHORIZED", 401);
    }

    const { status, note } = await request.json();

    if (!status || !["good", "fair", "poor", "closed"].includes(status)) {
      return apiError("Status must be good, fair, poor, or closed", "VALIDATION_ERROR", 400);
    }

    if (!note || typeof note !== "string" || note.trim().length === 0) {
      return apiError("Note is required", "VALIDATION_ERROR", 400);
    }

    if (note.length > 500) {
      return apiError("Note too long (max 500 characters)", "VALIDATION_ERROR", 400);
    }

    await insertCondition(uuidv4(), routeId, user.id, status, note.trim());
    const conditions = await getRouteConditions(routeId);
    return NextResponse.json(conditions);
  } catch (err) {
    return handleApiError(err);
  }
}
