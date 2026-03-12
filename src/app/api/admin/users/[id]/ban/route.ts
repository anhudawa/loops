import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { banUser, unbanUser } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  // Don't allow banning yourself
  if (id === auth.user.id) {
    return NextResponse.json({ error: "Cannot ban yourself" }, { status: 400 });
  }

  await banUser(id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  await unbanUser(id);
  return NextResponse.json({ ok: true });
}
