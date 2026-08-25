export type DeploymentTarget = "staging" | "production";

export interface DeploymentPreflightResult {
  target: DeploymentTarget | null;
  passed: boolean;
  failures: string[];
  warnings: string[];
}

function decodesTo32Bytes(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const bytes = /^[a-f\d]{64}$/i.test(value)
      ? Buffer.from(value, "hex")
      : Buffer.from(value, "base64");
    return bytes.length === 32;
  } catch {
    return false;
  }
}

function validHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function evaluateDeploymentPreflight(
  env: Record<string, string | undefined>
): DeploymentPreflightResult {
  const target = env.LOOPS_DEPLOYMENT_ENV === "staging" || env.LOOPS_DEPLOYMENT_ENV === "production"
    ? env.LOOPS_DEPLOYMENT_ENV
    : null;
  const failures: string[] = [];
  const warnings: string[] = [];

  if (!target) failures.push("LOOPS_DEPLOYMENT_ENV must be staging or production");
  if (!env.POSTGRES_URL) failures.push("POSTGRES_URL is required for the application");
  if (!env.POSTGRES_URL_NON_POOLING) failures.push("POSTGRES_URL_NON_POOLING is required for ordered migrations");
  if (!env.LOOPS_DATABASE_TARGET || env.LOOPS_DATABASE_TARGET !== target) {
    failures.push("LOOPS_DATABASE_TARGET must exactly match LOOPS_DEPLOYMENT_ENV");
  }
  if (!env.LOOPS_EXPECTED_DATABASE_HOST) failures.push("LOOPS_EXPECTED_DATABASE_HOST is required");
  if (!env.LOOPS_EXPECTED_DATABASE_NAME) failures.push("LOOPS_EXPECTED_DATABASE_NAME is required");
  if (!decodesTo32Bytes(env.LOOPS_TOKEN_ENCRYPTION_KEY)) {
    failures.push("LOOPS_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  if (!validHttpsUrl(env.NEXT_PUBLIC_BASE_URL)) {
    failures.push("NEXT_PUBLIC_BASE_URL must be an HTTPS URL");
  }
  if (!validHttpsUrl(env.NEXT_PUBLIC_MAP_TILE_URL)) {
    failures.push("NEXT_PUBLIC_MAP_TILE_URL must be a contracted HTTPS tile URL");
  }
  if (!env.NEXT_PUBLIC_MAP_ATTRIBUTION?.trim()) {
    failures.push("NEXT_PUBLIC_MAP_ATTRIBUTION is required");
  }

  const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const emailConfigured = Boolean(env.RESEND_API_KEY);
  if (!googleConfigured && !emailConfigured) {
    failures.push("Configure at least one complete sign-in method (Google or email)");
  }
  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
    failures.push("Google sign-in requires both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  }

  if (env.LOOPS_ALLOW_SYNTHETIC_SEED === "true") {
    failures.push("Synthetic seed data must be disabled outside isolated development");
  }
  if (env.LOOPS_ROUTE_GEN_ENABLED === "true") {
    failures.push("Fresh public route generation must remain disabled for the relaunch");
  }
  if (
    env.STRAVA_CLIENT_ID || env.STRAVA_CLIENT_SECRET || env.STRAVA_REDIRECT_URI ||
    env.GARMIN_CONSUMER_KEY || env.GARMIN_CONSUMER_SECRET
  ) {
    failures.push("Remove disabled Strava/Garmin integration credentials from the relaunch environment");
  }

  if (!env.ANTHROPIC_API_KEY) {
    warnings.push("ANTHROPIC_API_KEY is absent; route requests use the deterministic parser only");
  }

  if (target === "production") {
    if (!env.LOOPS_LEGAL_REVIEWED_AT) {
      failures.push("LOOPS_LEGAL_REVIEWED_AT is required after Irish legal sign-off");
    }
    if (!env.LOOPS_MONITORING_PROVIDER || !env.LOOPS_MONITORING_ALERTS_VERIFIED_AT) {
      failures.push("Production monitoring provider and tested-alert timestamp are required");
    }
  }

  return { target, passed: failures.length === 0, failures, warnings };
}
