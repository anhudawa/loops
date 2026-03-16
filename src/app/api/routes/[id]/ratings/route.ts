import { NextRequest, NextResponse } from "next/server";
import { getRouteRating, getUserRating, upsertRating, getUserBySession } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rating = await getRouteRating(id);

    // Include user's own rating if logged in
    const sessionToken = request.cookies.get("session")?.value;
    let userRating: number | null = null;
    if (sessionToken) {
      const user = await getUserBySession(sessionToken);
      if (user) {
        userRating = await getUserRating(id, user.id);
      }
    }

    return NextResponse.json({ ...rating, userRating });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionToken = request.cookies.get("session")?.value;

    if (!sessionToken) {
      return apiError("Sign in to rate routes", "UNAUTHORIZED", 401);
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      return apiError("Invalid session", "UNAUTHORIZED", 401);
    }

    const { score } = await request.json();
    const intScore = Number(score);
    if (!Number.isInteger(intScore) || intScore < 1 || intScore > 5) {
      return apiError("Score must be an integer 1-5", "VALIDATION_ERROR", 400);
    }

    await upsertRating(uuidv4(), id, user.id, intScore);
    const rating = await getRouteRating(id);
    return NextResponse.json({ ...rating, userRating: intScore });
  } catch (err) {
    return handleApiError(err);
  }
}
