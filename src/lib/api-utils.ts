import { NextResponse } from "next/server";
import { captureOperationalError } from "@/lib/error-monitoring";

export function apiError(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function handleApiError(err: unknown) {
  const reference = await captureOperationalError(err, "api");
  return NextResponse.json(
    { error: "Internal server error", code: "INTERNAL_ERROR", reference },
    { status: 500 }
  );
}

/** Strip HTML tags from user input to prevent XSS in stored content */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}
