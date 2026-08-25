export type OperationalErrorSource = "api" | "next_request" | "background";

export interface OperationalErrorDescriptor {
  fingerprint: string;
  errorName: string;
  errorCode: string | null;
}

function safeToken(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80);
  return cleaned || fallback;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Build a stable diagnostic group without persisting the raw error message,
 * stack trace, request path or any rider-provided value. Web Crypto keeps this
 * helper compatible with both the Node and Edge instrumentation runtimes.
 */
export async function describeOperationalError(
  error: unknown
): Promise<OperationalErrorDescriptor> {
  const candidate = error && typeof error === "object"
    ? error as { name?: unknown; code?: unknown; stack?: unknown }
    : {};
  const errorName = safeToken(candidate.name, "UnknownError");
  const errorCode = typeof candidate.code === "string"
    ? safeToken(candidate.code, "UNKNOWN")
    : null;
  const firstCodeFrame = typeof candidate.stack === "string"
    ? candidate.stack
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("at "))
      ?.replace(/:\d+:\d+/g, ":#:#")
      .replace(/(?:file:\/\/)?\/[^)\s]+\/(src|app)\//g, "[app]/$1/")
    : undefined;
  const input = new TextEncoder().encode(
    [errorName, errorCode ?? "", firstCodeFrame ?? "no-frame"].join("|")
  );
  const fingerprint = toHex(await globalThis.crypto.subtle.digest("SHA-256", input));
  return { fingerprint, errorName, errorCode };
}

export async function logSafeOperationalError(
  error: unknown,
  source: OperationalErrorSource
): Promise<{ referenceId: string; descriptor: OperationalErrorDescriptor }> {
  const referenceId = globalThis.crypto.randomUUID();
  const descriptor = await describeOperationalError(error);
  console.error(JSON.stringify({
    level: "error",
    event: "loops_operational_error",
    reference_id: referenceId,
    fingerprint: descriptor.fingerprint,
    source,
    error_name: descriptor.errorName,
    error_code: descriptor.errorCode,
  }));
  return { referenceId, descriptor };
}
