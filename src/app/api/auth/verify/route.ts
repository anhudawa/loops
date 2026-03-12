import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { validateMagicLink, upsertUser } from "@/lib/db";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  const result = await validateMagicLink(token);

  if (!result) {
    return NextResponse.redirect(new URL("/login?error=invalid_or_expired", request.url));
  }

  const sessionToken = uuidv4();
  const user = await upsertUser(uuidv4(), result.email, null, sessionToken);

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set("session", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return response;
}
