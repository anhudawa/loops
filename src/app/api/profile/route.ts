import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin";
import { updateUserProfile } from "@/lib/db";

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { name, bio, location } = await request.json();

  // Validate
  if (name !== undefined && typeof name !== "string") {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }
  if (bio !== undefined && typeof bio !== "string") {
    return NextResponse.json({ error: "Invalid bio" }, { status: 400 });
  }
  if (bio && bio.length > 500) {
    return NextResponse.json({ error: "Bio must be 500 characters or less" }, { status: 400 });
  }
  if (location !== undefined && typeof location !== "string") {
    return NextResponse.json({ error: "Invalid location" }, { status: 400 });
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
}
