import { NextRequest, NextResponse } from "next/server";
import { getUserActivityFeed } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const page = Number(request.nextUrl.searchParams.get("page") || "1");
  const activity = await getUserActivityFeed(id, page, 20);
  return NextResponse.json({ activity });
}
