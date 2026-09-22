import { NextResponse } from "next/server";

export function apiError(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

export function handleApiError(err: unknown) {
  console.error("[API Error]", err);
  // A database error's SQLSTATE (e.g. 2201F argument out of range, 42P18
  // indeterminate datatype) is safe to expose and turns a blind 500 into a
  // diagnosable one without log access.
  const pgCode = typeof err === "object" && err && "code" in err && typeof (err as { code: unknown }).code === "string"
    ? (err as { code: string }).code
    : undefined;
  const res = apiError("Internal server error", "INTERNAL_ERROR", 500);
  if (pgCode && /^[0-9A-Z]{5}$/.test(pgCode)) res.headers.set("x-db-error", pgCode);
  return res;
}

/** Strip HTML tags from user input to prevent XSS in stored content */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}
