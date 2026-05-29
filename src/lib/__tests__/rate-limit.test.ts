import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit } from "../rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    // Reset the module-level store between tests by using distinct keys.
    // The store is keyed by (key, window) so a fresh key = a fresh bucket.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T12:00:00Z"));
  });

  it("allows up to `maxRequests` in the window and blocks the next one", () => {
    const key = "test:allow-then-block";
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    const denied = checkRateLimit(key, 3, 60_000);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.resetMs).toBeGreaterThan(0);
    expect(denied.resetMs).toBeLessThanOrEqual(60_000);
  });

  it("reports remaining correctly while under the limit", () => {
    const key = "test:remaining";
    const first = checkRateLimit(key, 5, 60_000);
    expect(first.remaining).toBe(4);
    const second = checkRateLimit(key, 5, 60_000);
    expect(second.remaining).toBe(3);
  });

  it("allows a new request once the window has expired", () => {
    const key = "test:window-expiry";
    checkRateLimit(key, 2, 1_000);
    checkRateLimit(key, 2, 1_000);
    expect(checkRateLimit(key, 2, 1_000).allowed).toBe(false);

    vi.advanceTimersByTime(1_100);
    expect(checkRateLimit(key, 2, 1_000).allowed).toBe(true);
  });

  it("isolates buckets by key", () => {
    const keyA = "test:isolate:a";
    const keyB = "test:isolate:b";
    checkRateLimit(keyA, 1, 60_000);
    expect(checkRateLimit(keyA, 1, 60_000).allowed).toBe(false);
    // keyB is untouched and should still be allowed
    expect(checkRateLimit(keyB, 1, 60_000).allowed).toBe(true);
  });
});
