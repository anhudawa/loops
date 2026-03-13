import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin";
import { updateUserProfile } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { name, bio, location } = await request.json();

    // Validate
    if (name !== undefined && typeof name !== "string") {
      return apiError("Invalid name", "VALIDATION_ERROR", 400);
    }
    if (bio !== undefined && typeof bio !== "string") {
      return apiError("Invalid bio", "VALIDATION_ERROR", 400);
    }
    if (bio && bio.length > 500) {
      return apiError("Bio must be 500 characters or less", "VALIDATION_ERROR", 400);
    }
    if (location !== undefined && typeof location !== "string") {
      return apiError("Invalid location", "VALIDATION_ERROR", 400);
    }

    const updated = await updateUserProfile(auth.user.id, {
      name: name || undefined,
      bio: bio !== undefined ? bio : undefined,
      location: location !== undefined ? location : undefined,
    });

    return NextResponse.json({
      id: updated!.id,
      name: updated!.name,
      bio: updated!.bio,
      location: updated!.location,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
