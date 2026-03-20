import { NextRequest, NextResponse } from "next/server";
import { generateRoutes } from "@/lib/route-generator";

// Whole pipeline must complete within 30 seconds (Vercel serverless limit)
const PIPELINE_TIMEOUT_MS = 28000;

export async function POST(request: NextRequest) {
  let prompt: string;

  try {
    const body = await request.json();
    prompt = body?.prompt;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_BODY" },
      { status: 400 }
    );
  }

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json(
      { error: "Missing required field: prompt", code: "MISSING_PROMPT" },
      { status: 400 }
    );
  }

  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.length < 10) {
    return NextResponse.json(
      { error: "Prompt is too short — please describe the route you want", code: "PROMPT_TOO_SHORT" },
      { status: 400 }
    );
  }

  if (trimmedPrompt.length > 1000) {
    return NextResponse.json(
      { error: "Prompt is too long (max 1000 characters)", code: "PROMPT_TOO_LONG" },
      { status: 400 }
    );
  }

  // Wrap in a timeout race so the serverless function never hangs
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Route generation timed out after 28 seconds")),
      PIPELINE_TIMEOUT_MS
    )
  );

  try {
    const routes = await Promise.race([generateRoutes(trimmedPrompt), timeoutPromise]);

    return NextResponse.json({ data: routes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // Surface user-friendly messages for known failure modes
    if (message.includes("timed out")) {
      return NextResponse.json(
        { error: "Route generation timed out — try a shorter distance or a more specific location", code: "TIMEOUT" },
        { status: 504 }
      );
    }

    if (message.includes("geocode") || message.includes("location")) {
      return NextResponse.json(
        { error: message, code: "GEOCODE_FAILED" },
        { status: 422 }
      );
    }

    if (message.includes("No valid routes")) {
      return NextResponse.json(
        { error: message, code: "NO_ROUTES_FOUND" },
        { status: 422 }
      );
    }

    if (message.includes("Overpass")) {
      return NextResponse.json(
        { error: "Could not fetch road network data — please try again in a moment", code: "OVERPASS_ERROR" },
        { status: 503 }
      );
    }

    console.error("[generate-route] Unexpected error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while generating routes", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
