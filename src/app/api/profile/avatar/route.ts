import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getUserBySession } from "@/lib/db";
import { sql } from "@vercel/postgres";
import { apiError, handleApiError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("session")?.value;
    if (!sessionToken) {
      return apiError("Not authenticated", "UNAUTHORIZED", 401);
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      return apiError("Not authenticated", "UNAUTHORIZED", 401);
    }

    const formData = await request.formData();
    const file = formData.get("avatar") as File | null;

    if (!file) {
      return apiError("No file provided", "VALIDATION_ERROR", 400);
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return apiError("File must be an image", "VALIDATION_ERROR", 400);
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      return apiError("Image must be under 2MB", "VALIDATION_ERROR", 400);
    }

    const blob = await put(`avatars/${user.id}-${Date.now()}.${file.type.split("/")[1]}`, file, {
      access: "public",
    });

    // Update user avatar_url in database
    await sql`UPDATE users SET avatar_url = ${blob.url} WHERE id = ${user.id}`;

    return NextResponse.json({ avatar_url: blob.url });
  } catch (err) {
    return handleApiError(err);
  }
}
