import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getUserBySession } from "@/lib/db";
import { sql } from "@vercel/postgres";

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get("session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await getUserBySession(sessionToken);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("avatar") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate file type
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }

  // Validate file size (2MB max)
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Image must be under 2MB" }, { status: 400 });
  }

  try {
    const blob = await put(`avatars/${user.id}-${Date.now()}.${file.type.split("/")[1]}`, file, {
      access: "public",
    });

    // Update user avatar_url in database
    await sql`UPDATE users SET avatar_url = ${blob.url} WHERE id = ${user.id}`;

    return NextResponse.json({ avatar_url: blob.url });
  } catch {
    return NextResponse.json({ error: "Failed to upload avatar" }, { status: 500 });
  }
}
