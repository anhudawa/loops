import { NextRequest, NextResponse } from "next/server";
import { getUserBySession, setAdminRole, User } from "@/lib/db";

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
    // ADMIN_EMAILS (Vercel env, comma-separated) grants admin without a
    // database edit; the role is stored the first time it is used.
    if (!isAdminEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await setAdminRole(user.id, true);
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

/** Emails listed in ADMIN_EMAILS (comma-separated, case-insensitive) are admins. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}
