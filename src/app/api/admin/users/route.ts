import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getAllUsers } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const page = Number(request.nextUrl.searchParams.get("page") || "1");
  const data = await getAllUsers(page, 50);
  return NextResponse.json(data);
}
