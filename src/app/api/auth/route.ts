import { isAdminEmail } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";
import { getUserBySession, setAdminRole } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("session")?.value;

    if (!sessionToken) {
      return NextResponse.json({ user: null });
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      return NextResponse.json({ user: null });
    }
    // ADMIN_EMAILS grants admin at sign-in (stored once).
    if (user.role !== "admin" && isAdminEmail(user.email)) {
      await setAdminRole(user.id, true);
      user.role = "admin";
    }

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar_url: user.avatar_url, strava_id: user.strava_id ?? null },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("session", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
