import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { deleteComment } from "@/lib/db";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  await deleteComment(id);
  return NextResponse.json({ ok: true });
}
