import { NextRequest, NextResponse } from "next/server";
import { getRouteConditions, insertCondition, getUserBySession } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conditions = await getRouteConditions(id);
  return NextResponse.json(conditions);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: routeId } = await params;
  const sessionToken = request.cookies.get("session")?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "Sign in to report conditions" }, { status: 401 });
  }

  const user = await getUserBySession(sessionToken);
  if (!user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { status, note } = await request.json();

  if (!status || !["good", "fair", "poor", "closed"].includes(status)) {
    return NextResponse.json({ error: "Status must be good, fair, poor, or closed" }, { status: 400 });
  }

  if (!note || typeof note !== "string" || note.trim().length === 0) {
    return NextResponse.json({ error: "Note is required" }, { status: 400 });
  }

  if (note.length > 500) {
    return NextResponse.json({ error: "Note too long (max 500 characters)" }, { status: 400 });
  }

  await insertCondition(uuidv4(), routeId, user.id, status, note.trim());
  const conditions = await getRouteConditions(routeId);
  return NextResponse.json(conditions);
}
