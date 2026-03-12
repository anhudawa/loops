import { NextRequest, NextResponse } from "next/server";
import { getUserBySession, User } from "@/lib/db";

export async function requireAdmin(
  request: NextRequest
): Promise<{ user: User } | NextResponse> {
  const sessionToken = request.cookies.get("session")?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserBySession(sessionToken);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { user };
}

export async function requireAuth(
  request: NextRequest
): Promise<{ user: User } | NextResponse> {
  const sessionToken = request.cookies.get("session")?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserBySession(sessionToken);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { user };
}
