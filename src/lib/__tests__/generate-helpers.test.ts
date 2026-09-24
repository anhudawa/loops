import { describe, it, expect } from "vitest";
import {
  friendlyHttpError,
  promptLongEnough,
  resultsHeading,
  readResults,
  writeResults,
  clearResults,
  RESULTS_TTL_MS,
} from "@/app/generate/generate-helpers";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("friendlyHttpError", () => {
  it("never leaks a parser message and maps common statuses", () => {
    expect(friendlyHttpError(502).message).toMatch(/hiccuped/);
    expect(friendlyHttpError(500).code).toBe("SERVER");
    expect(friendlyHttpError(429).code).toBe("RATE_LIMITED");
    expect(friendlyHttpError(504).code).toBe("TIMEOUT");
    expect(friendlyHttpError(401).code).toBe("UNAUTHORIZED");
    expect(friendlyHttpError(502).message).not.toMatch(/JSON|token/);
  });
});

describe("resultsHeading", () => {
  it("matches the cards under it", () => {
    expect(resultsHeading(["generated", "generated"])).toBe("Freshly built for you");
    expect(resultsHeading(["library", "library"])).toBe("Matched from our verified library");
    expect(resultsHeading(["library", "generated"])).toBe("From our verified library, plus one built for you");
    expect(resultsHeading(["library", "generated", "generated"])).toMatch(/plus loops built for you/);
  });
});

describe("results cache", () => {
  it("round-trips the last results for this tab", () => {
    const s = memoryStorage();
    writeResults({ prompt: "2 hour ride from Skerries", interpreted: { distance_km: 50 }, candidates: [{ id: 1 }] }, s, 1000);
    const r = readResults<{ distance_km: number }, { id: number }>(s, 2000);
    expect(r?.prompt).toBe("2 hour ride from Skerries");
    expect(r?.candidates).toEqual([{ id: 1 }]);
    expect(r?.interpreted?.distance_km).toBe(50);
  });

  it("expires, clears and tolerates junk", () => {
    const s = memoryStorage();
    writeResults({ prompt: "x", interpreted: null, candidates: [] }, s, 0);
    expect(readResults(s, RESULTS_TTL_MS + 1)).toBeNull();
    writeResults({ prompt: "x", interpreted: null, candidates: [] }, s, 0);
    clearResults(s);
    expect(readResults(s, 1)).toBeNull();
    s.setItem("loops:generate:last", "{not json");
    expect(readResults(s, 1)).toBeNull();
    expect(readResults(null)).toBeNull();
  });
});

describe("promptLongEnough", () => {
  it("accepts a short ask that says how long", () => {
    for (const q of ["40km loop", "40 km", "2h", "1 hour", "90 min spin", "60k"]) expect(promptLongEnough(q)).toBe(true);
  });
  it("still asks for more from a short ask with no length", () => {
    for (const q of ["loop", "hilly", "a ride", "  x  "]) expect(promptLongEnough(q)).toBe(false);
  });
  it("anything of 10+ characters goes through", () => {
    expect(promptLongEnough("quiet lanes please")).toBe(true);
  });
});
