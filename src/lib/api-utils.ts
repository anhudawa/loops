import { NextResponse } from "next/server";

export function apiError(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

export function handleApiError(err: unknown) {
  console.error("[API Error]", err);
  return apiError("Internal server error", "INTERNAL_ERROR", 500);
}

/** Strip HTML tags from user input to prevent XSS in stored content */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}
