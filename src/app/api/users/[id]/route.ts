import { NextRequest, NextResponse } from "next/server";
import { getUserById, getUserStats, getUserRoutes } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getUserById(id);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const stats = await getUserStats(id);
  const routes = await getUserRoutes(id);

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    created_at: user.created_at,
    stats,
    routes,
  });
}
