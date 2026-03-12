import { NextRequest, NextResponse } from "next/server";
import { getRouteRating, getUserRating, upsertRating, getUserBySession } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionToken = request.cookies.get("session")?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "Sign in to rate routes" }, { status: 401 });
  }

  const user = await getUserBySession(sessionToken);
  if (!user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { score } = await request.json();
  if (!score || score < 1 || score > 5) {
    return NextResponse.json({ error: "Score must be 1-5" }, { status: 400 });
  }

  await upsertRating(uuidv4(), id, user.id, score);
  const rating = await getRouteRating(id);
  return NextResponse.json({ ...rating, userRating: score });
}
