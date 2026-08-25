import { NextRequest, NextResponse } from "next/server";
import { getCollections, insertCollection } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { apiError, handleApiError, stripHtml } from "@/lib/api-utils";
import { slugify } from "@/lib/seo";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  try {
    const collections = await getCollections();
    return NextResponse.json({ data: collections });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { name, description, location, country, cover_image_url, discipline, difficulty_range, featured, seo_title, seo_description } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return apiError("name is required", "VALIDATION_ERROR", 400);
    }
    if (discipline && discipline !== "road") {
      return apiError("Ireland beta collections must be road cycling", "UNSUPPORTED_DISCIPLINE", 400);
    }
    if (country && country !== "Ireland") {
      return apiError("Ireland is the only active collection market", "UNSUPPORTED_MARKET", 400);
    }

    const collection = await insertCollection({
      id: uuidv4(),
      name: stripHtml(name.trim()),
      slug: slugify(name.trim()),
      description: description ? stripHtml(description) : null,
      location: location ? stripHtml(location) : null,
      country: "Ireland",
      cover_image_url: cover_image_url || null,
      discipline: "road",
      difficulty_range: difficulty_range || null,
      featured: featured ?? false,
      seo_title: seo_title ? stripHtml(seo_title) : null,
      seo_description: seo_description ? stripHtml(seo_description) : null,
    });

    return NextResponse.json({ data: collection }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
