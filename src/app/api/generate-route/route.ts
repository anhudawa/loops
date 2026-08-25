import { NextRequest, NextResponse } from "next/server";
import { generateRouteCandidates } from "@/lib/route-generator";
import { getUserBySession } from "@/lib/db";
import { DEFAULT_SPEED_KMH } from "@/config/constants";
import { checkRateLimit } from "@/lib/rate-limit";
import { ACTIVE_LAUNCH_MARKET } from "@/config/route-policy";
import { handleApiError } from "@/lib/api-utils";
import { hasActiveBetaAccess } from "@/lib/beta-intake";

/** Allow up to 60s on Vercel (fluid compute / Pro); clamped lower on hobby. */
export const maxDuration = 60;

// The pipeline must finish inside the serverless budget with margin to
// return an honest error instead of a platform-level cut-off.
const PIPELINE_TIMEOUT_MS = 55_000;

/** Intent parsing may use an LLM. Keep the per-rider rate low to protect cost. */
const RATE_LIMIT_PER_MIN = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRouteSearchEnabled(): boolean {
  return process.env.LOOPS_ROUTE_SEARCH_ENABLED !== "false";
}

export async function POST(request: NextRequest) {
  if (!isRouteSearchEnabled()) {
    return NextResponse.json(
      {
        error: "Route search is not currently available.",
        code: "FEATURE_DISABLED",
      },
      { status: 503 }
    );
  }

  // The closed beta is signed-in and invitation-only; rate-limit per member.
  const sessionToken = request.cookies.get("session")?.value;
  const user = sessionToken ? await getUserBySession(sessionToken) : null;
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to search the Ireland beta", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }
  if (user.role !== "admin" && !(await hasActiveBetaAccess(user.id))) {
    return NextResponse.json(
      { error: "Apply for Ireland beta access before searching routes", code: "BETA_ACCESS_REQUIRED" },
      { status: 403 }
    );
  }
  const rateLimitKey = `generate-route:user:${user.id}`;

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
  let origin: [number, number] | undefined;

  try {
    const body = await request.json();
    prompt = body?.prompt;
    // Optional browser location [lat, lng] — used as start point when the
    // prompt doesn't name a place ("I'm here now, give me a ride").
    if (Array.isArray(body?.origin) && body.origin.length === 2) {
      const [lat, lng] = body.origin;
      if (
        typeof lat === "number" && typeof lng === "number" &&
        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      ) {
        origin = [lat, lng];
      }
    }
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

  // Wrap in a timeout race so the serverless function never hangs.
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("ROUTE_SEARCH_TIMEOUT")),
      PIPELINE_TIMEOUT_MS
    )
  );

  const startedAt = Date.now();
  try {
    // Personalise the duration → distance conversion with the rider's
    // avg_speed_kmh so "2 hour loop" means the right distance for them.
    const result = await Promise.race([
      generateRouteCandidates(trimmedPrompt, {
        userSpeedKmh: user.avg_speed_kmh ?? DEFAULT_SPEED_KMH,
        origin,
      }),
      timeoutPromise,
    ]);

    if (result.interpreted.discipline !== "road") {
      return NextResponse.json(
        {
          error: "The Ireland beta currently covers road cycling only.",
          code: "UNSUPPORTED_DISCIPLINE",
        },
        { status: 422 }
      );
    }
    if (result.interpreted.country !== ACTIVE_LAUNCH_MARKET.country) {
      return NextResponse.json(
        {
          error: "LOOPS is launching in Ireland first. Girona and Mallorca follow after the Irish beta meets its quality gates.",
          code: "UNSUPPORTED_MARKET",
        },
        { status: 422 }
      );
    }

    if (result.candidates.some((candidate) => candidate.source !== "library")) {
      throw new Error("FRESH_ROUTE_POLICY_VIOLATION");
    }

    console.log(
      JSON.stringify({
        evt: "reviewed_route_search",
        outcome: "ok",
        latency_ms: Date.now() - startedAt,
        prompt_len: trimmedPrompt.length,
        result_count: result.candidates.length,
        is_workout: result.interpreted.is_workout,
        wind_strategy: result.interpreted.wind_strategy ?? null,
      })
    );

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "ROUTE_SEARCH_TIMEOUT") {
      return NextResponse.json(
        { error: "Route search timed out — try a more specific Irish starting area", code: "TIMEOUT" },
        { status: 504 }
      );
    }

    if (message.includes("geocode") || message.includes("location")) {
      return NextResponse.json(
        { error: "We could not find that starting area in Ireland.", code: "GEOCODE_FAILED" },
        { status: 422 }
      );
    }

    if (message.includes("Failed to parse LLM response")) {
      return NextResponse.json(
        {
          error: "I couldn't fully understand that — use the quick form below and I'll take it from there.",
          code: "PARSE_FAILED",
        },
        { status: 422 }
      );
    }

    return handleApiError(err);
  }
}
