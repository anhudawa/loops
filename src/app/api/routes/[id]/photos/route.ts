import { NextRequest, NextResponse } from "next/server";
import { getRoutePhotos, insertPhoto, getUserBySession } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const photos = await getRoutePhotos(id);
    return NextResponse.json(photos);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: routeId } = await params;
    const sessionToken = request.cookies.get("session")?.value;

    if (!sessionToken) {
      return apiError("Sign in to upload photos", "UNAUTHORIZED", 401);
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      return apiError("Invalid session", "UNAUTHORIZED", 401);
    }

    const formData = await request.formData();
    const file = formData.get("photo") as File | null;
    const caption = formData.get("caption") as string | null;

    if (!file) {
      return apiError("Photo is required", "VALIDATION_ERROR", 400);
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return apiError("Only JPEG, PNG, and WebP images are allowed", "VALIDATION_ERROR", 400);
    }

    if (file.size > 5 * 1024 * 1024) {
      return apiError("Photo must be under 5MB", "VALIDATION_ERROR", 400);
    }

    const photoId = uuidv4();
    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const filename = `${photoId}.${ext}`;

    // TODO: Use Vercel Blob for file storage in production
    await insertPhoto(photoId, routeId, user.id, filename, caption?.trim() || null);
    const photos = await getRoutePhotos(routeId);
    return NextResponse.json(photos, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
