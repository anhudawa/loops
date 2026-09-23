import { NextRequest, NextResponse } from "next/server";
import { generateRouteCandidates, NoValidRoutesError } from "@/lib/route-generator";
import { getUserBySession, recordEvent, ANALYTICS_EVENTS } from "@/lib/db";
import { DEFAULT_SPEED_KMH } from "@/config/constants";
import { checkRateLimit } from "@/lib/rate-limit";

/** Allow up to 60s on Vercel (fluid compute / Pro); clamped lower on hobby. */
export const maxDuration = 60;

// The pipeline must finish inside the serverless budget with margin to
// return an honest error instead of a platform-level cut-off.
const PIPELINE_TIMEOUT_MS = 55_000;

/** Each generation hits the LLM + Overpass + BRouter + Open-Meteo. Keep
 * the per-rider rate low to protect cost and downstream quotas. */
const RATE_LIMIT_PER_MIN = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Generation is ON by default — library-first matching, hard guardrails,
 * quality floor and live verification are all in place. The env var is
 * kept as an emergency kill-switch: set LOOPS_ROUTE_GEN_ENABLED=false to
 * disable without a deploy.
 */
function isEnabled(): boolean {
  return process.env.LOOPS_ROUTE_GEN_ENABLED !== "false";
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
  // Fail soft: a DB hiccup on the session lookup must NOT 500 the whole
  // generation (which returned an empty-body 500 → cryptic "Unexpected end of
  // JSON input" for the rider). Treat it as anonymous and carry on, exactly
  // like /api/reroute does.
  const user = sessionToken
    ? await getUserBySession(sessionToken).catch(() => null)
    : null;
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
  let origin: [number, number] | undefined;
  let repeatEfforts: boolean | undefined;

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
    // Workouts: "OK to repeat your efforts on the same stretch?"
    if (typeof body?.repeat_efforts === "boolean") repeatEfforts = body.repeat_efforts;
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
      () => reject(new Error(`Route generation timed out after ${Math.round(PIPELINE_TIMEOUT_MS / 1000)} seconds`)),
      PIPELINE_TIMEOUT_MS
    )
  );

  // Funnel: a generation was requested (fire-and-forget, no PII).
  void recordEvent(ANALYTICS_EVENTS.GENERATION_REQUESTED, {
    userId: user?.id ?? null,
    properties: { prompt_len: trimmedPrompt.length, has_origin: !!origin },
  });

  const startedAt = Date.now();
  try {
    // Personalise the duration → distance conversion with the rider's
    // avg_speed_kmh so "2 hour loop" means the right distance for them.
    // The user lookup was already done above for rate limiting.
    const userSpeedKmh = user?.avg_speed_kmh;

    const result = await Promise.race([
      generateRouteCandidates(trimmedPrompt, {
        userSpeedKmh: userSpeedKmh ?? DEFAULT_SPEED_KMH,
        origin,
        repeatEfforts,
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
        wind_strategy: result.interpreted.wind_strategy ?? null,
        // Cumulative seconds at the end of each pipeline phase.
        timings: result.timings ?? null,
        // Score corpus (launch spec §4): how the served candidates rated.
        scores: result.candidates.map((r) => ({
          source: r.source,
          match: r.match_score,
          quality: r.source === "generated" ? r.quality_score : null,
          wind: r.source === "generated" ? r.wind_alignment_score ?? null : null,
          km: r.distance_km,
        })),
      })
    );

    // Funnel + product analytics: generation succeeded. We store the
    // route-REQUEST shape (area, distance, terrain, workout structure) so we
    // can see what riders actually ask for and build/write to it. No PII.
    const spec = result.interpreted;
    void recordEvent(ANALYTICS_EVENTS.GENERATION_SUCCEEDED, {
      userId: user?.id ?? null,
      properties: {
        result_count: result.candidates.length,
        library_count: librarySources,
        generated_count: generatedSources,
        // What was requested:
        area: spec.region ?? null,
        country: spec.country ?? null,
        distance_km: spec.distance_km ?? null,
        discipline: spec.discipline ?? null,
        elevation_preference: spec.elevation_preference ?? null,
        wind_strategy: spec.wind_strategy ?? null,
        is_workout: spec.is_workout,
        workout_summary: spec.workout_summary ?? null,
        cafe_stop: spec.cafe_stop ?? null,
      },
    });

    // Phase timings ride along (cumulative seconds; no PII) so production
    // latency can be profiled from a request, not from log access.
    return NextResponse.json({ data: result, timings: result.timings ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const code = err instanceof NoValidRoutesError ? "NO_ROUTES_FOUND" : classifyErrorCode(message);

    // Funnel: generation declined/failed — code distinguishes an honest
    // decline (no routes / no workout match) from an infra error.
    void recordEvent(ANALYTICS_EVENTS.GENERATION_DECLINED, {
      userId: user?.id ?? null,
      properties: { code },
    });
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

    // Honest decline with the reasons (trust rule) — also our production
    // diagnostics: what was parsed and why every candidate was dropped.
    if (err instanceof NoValidRoutesError) {
      return NextResponse.json(
        {
          error: message,
          code: "NO_ROUTES_FOUND",
          details: { candidates: err.candidateCount, dropped: err.dropped },
          interpreted: err.spec,
        },
        { status: 422 }
      );
    }

    if (message.includes("No valid routes")) {
      return NextResponse.json(
        { error: message, code: "NO_ROUTES_FOUND" },
        { status: 422 }
      );
    }

    if (message.includes("host this workout") || message.includes("uninterrupted at that intensity")) {
      return NextResponse.json(
        { error: message, code: "NO_WORKOUT_MATCH" },
        { status: 422 }
      );
    }
    if (message.includes("geocode") || message.includes("location") || message.includes("too far to ride")) {
      return NextResponse.json(
        { error: message, code: "GEOCODE_FAILED" },
        { status: 422 }
      );
    }

    if (message.includes("Failed to parse LLM response")) {
      return NextResponse.json(
        {
          error: /\binterval|\beffort|\bthreshold\b|\bftp\b|\btempo\b|\bvo2|sweet\s*spot|\bsprints?\b|\bzone\s*[3-7]\b/i.test(trimmedPrompt)
            ? "Tell me the efforts and I'll place them — e.g. \"4x4 min VO2 max\", \"2x20 min threshold\" or \"20 min tempo\", plus how long you want to ride."
            : "I couldn't fully understand that — use the quick form below and I'll take it from there.",
          code: "PARSE_FAILED",
        },
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
  if (message.includes("No valid routes")) return "NO_ROUTES_FOUND";
  if (message.includes("host this workout") || message.includes("uninterrupted at that intensity")) return "NO_WORKOUT_MATCH";
  if (message.includes("geocode") || message.includes("location") || message.includes("too far to ride")) return "GEOCODE_FAILED";
  if (message.includes("Failed to parse LLM response")) return "PARSE_FAILED";
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
