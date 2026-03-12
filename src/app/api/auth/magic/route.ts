import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createMagicLink, getUserByEmail } from "@/lib/db";
import { sendMagicLink } from "@/lib/email";

export async function POST(request: NextRequest) {
  const { email } = await request.json();

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const cleanEmail = email.toLowerCase().trim();

  // Check if user is banned
  const existing = await getUserByEmail(cleanEmail);
  if (existing?.role === "banned") {
    return NextResponse.json({ error: "Account suspended" }, { status: 403 });
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await createMagicLink(uuidv4(), cleanEmail, token, expiresAt);

  try {
    await sendMagicLink(cleanEmail, token);
  } catch (err) {
    console.error("Failed to send magic link:", err);
    return NextResponse.json({ error: "Failed to send email. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Check your email for a sign-in link" });
}
