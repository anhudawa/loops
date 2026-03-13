import { NextResponse } from "next/server";

export function apiError(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

export function handleApiError(err: unknown) {
  console.error("[API Error]", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  return apiError(message, "INTERNAL_ERROR", 500);
}
