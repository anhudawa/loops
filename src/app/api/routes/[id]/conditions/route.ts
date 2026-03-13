import { NextRequest, NextResponse } from "next/server";
import { getRouteConditions, insertCondition, getUserBySession } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { CONDITIONS_PER_PAGE, MAX_CONDITION_NOTE_LENGTH, CONDITION_STATUSES } from "@/config/constants";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const rows = await getRouteConditions(id, CONDITIONS_PER_PAGE + 1, (page - 1) * CONDITIONS_PER_PAGE);
    const hasMore = rows.length > CONDITIONS_PER_PAGE;
    const conditions = hasMore ? rows.slice(0, CONDITIONS_PER_PAGE) : rows;
    return NextResponse.json({ data: conditions, hasMore, page });
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

    if (!status || !(CONDITION_STATUSES as readonly string[]).includes(status)) {
      return apiError(`Status must be ${CONDITION_STATUSES.join(", ")}`, "VALIDATION_ERROR", 400);
    }

    if (!note || typeof note !== "string" || note.trim().length === 0) {
      return apiError("Note is required", "VALIDATION_ERROR", 400);
    }

    if (note.length > MAX_CONDITION_NOTE_LENGTH) {
      return apiError(`Note too long (max ${MAX_CONDITION_NOTE_LENGTH} characters)`, "VALIDATION_ERROR", 400);
    }

    await insertCondition(uuidv4(), routeId, user.id, status, note.trim());
    const rows = await getRouteConditions(routeId, CONDITIONS_PER_PAGE + 1, 0);
    const hasMore = rows.length > CONDITIONS_PER_PAGE;
    return NextResponse.json({ data: hasMore ? rows.slice(0, CONDITIONS_PER_PAGE) : rows, hasMore, page: 1 });
  } catch (err) {
    return handleApiError(err);
  }
}
