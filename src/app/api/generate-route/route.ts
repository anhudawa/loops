import { NextRequest, NextResponse } from "next/server";
import { generateRouteCandidates } from "@/lib/route-generator";
import { getUserBySession } from "@/lib/db";
import { DEFAULT_SPEED_KMH } from "@/config/constants";
import { checkRateLimit } from "@/lib/rate-limit";

// Whole pipeline must complete within 30 seconds (Vercel serverless limit)
const PIPELINE_TIMEOUT_MS = 28000;

/** Each generation hits the LLM + Overpass + BRouter + Open-Meteo. Keep
 * the per-rider rate low to protect cost and downstream quotas. */
const RATE_LIMIT_PER_MIN = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Gated behind LOOPS_ROUTE_GEN_ENABLED until the library-first match layer
 * and real-world verification are in place. One bad generated route and
 * nobody uses this feature again.
 */
function isEnabled(): boolean {
  return process.env.LOOPS_ROUTE_GEN_ENABLED === "true";
}

export async function POST(request: NextRequest) {
  if (!isEnabled()) {
    return NextResponse.json(
      {
        error: "Route generation is not yet available.",
        code: "FEATURE_DISABLED",
      },
      { status: 503 }
    );
  }

  // Rate-limit per user (signed-in) or per client IP (signed-out, unusual
  // since /generate is auth-gated, but keeps the endpoint sane if it's
  // ever called directly).
  const sessionToken = request.cookies.get("session")?.value;
  const user = sessionToken ? await getUserBySession(sessionToken) : null;
  const rateLimitKey = user
    ? `generate-route:user:${user.id}`
    : `generate-route:ip:${getClientIp(request)}`;

  const rl = checkRateLimit(rateLimitKey, RATE_LIMIT_PER_MIN, RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    const retrySec = Math.max(1, Math.ceil(rl.resetMs / 1000));
    return new NextResponse(
      JSON.stringify({
        error: `Too many requests. Try again in ${retrySec}s.`,
        code: "RATE_LIMITED",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retrySec),
        },
      }
    );
  }

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

  const startedAt = Date.now();
  try {
    // Personalise the duration → distance conversion with the rider's
    // avg_speed_kmh so "2 hour loop" means the right distance for them.
    // The user lookup was already done above for rate limiting.
    const userSpeedKmh = user?.avg_speed_kmh;

    const result = await Promise.race([
      generateRouteCandidates(trimmedPrompt, {
        userSpeedKmh: userSpeedKmh ?? DEFAULT_SPEED_KMH,
      }),
      timeoutPromise,
    ]);

    const librarySources = result.candidates.filter((r) => r.source === "library").length;
    const generatedSources = result.candidates.filter((r) => r.source === "generated").length;
    // Structured log — greppable in Vercel logs, pipe-safe for later
    // ingestion into a proper observability store.
    console.log(
      JSON.stringify({
        evt: "generate_route",
        outcome: "ok",
        user_id: user?.id ?? null,
        latency_ms: Date.now() - startedAt,
        prompt_len: trimmedPrompt.length,
        result_count: result.candidates.length,
        library_count: librarySources,
        generated_count: generatedSources,
        is_workout: result.interpreted.is_workout,
      })
    );

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const code = classifyErrorCode(message);
    console.log(
      JSON.stringify({
        evt: "generate_route",
        outcome: "error",
        code,
        user_id: user?.id ?? null,
        latency_ms: Date.now() - startedAt,
        prompt_len: trimmedPrompt.length,
      })
    );

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

    if (message.includes("host this workout")) {
      return NextResponse.json(
        { error: message, code: "NO_WORKOUT_MATCH" },
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

/** Map an error message to the structured code we log. Mirrors the same
 * checks used for user-facing responses. */
function classifyErrorCode(message: string): string {
  if (message.includes("timed out")) return "TIMEOUT";
  if (message.includes("geocode") || message.includes("location")) return "GEOCODE_FAILED";
  if (message.includes("No valid routes")) return "NO_ROUTES_FOUND";
  if (message.includes("host this workout")) return "NO_WORKOUT_MATCH";
  if (message.includes("Overpass")) return "OVERPASS_ERROR";
  return "INTERNAL_ERROR";
}

/** Best-effort client IP extraction for rate limiting. Order matches Vercel's
 * forwarding chain; any spoofing just gets the spoofer their own bucket. */
function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
