import { describe, it, expect } from "vitest";
import { readDraft, writeDraft, clearDraft, DRAFT_KEY, DRAFT_TTL_MS } from "@/app/plan/plan-draft";
import type { PlanLeg } from "@/lib/plan-legs";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const leg = (id: number, from: [number, number], to: [number, number]): PlanLeg => ({
  id,
  seq: id,
  from,
  to,
  coords: [from, [53.4, -6.2], to],
  elevations: [10, 20, 15],
  distance_km: 4.2,
  gain_m: 10,
  loss_m: 5,
  status: "snapped",
});

describe("plan draft", () => {
  const a: [number, number] = [53.58, -6.1];
  const b: [number, number] = [53.5, -6.2];
  const c: [number, number] = [53.45, -6.15];

  it("keeps a drawing exactly as drawn", () => {
    const s = memoryStorage();
    const legs = [leg(1, a, b), leg(2, b, c)];
    writeDraft({ anchors: [a, b, c], legs, loopLeg: leg(3, c, a), loopBack: true, discipline: "road" }, s, 1000);
    const d = readDraft(s, 2000);
    expect(d?.anchors).toEqual([a, b, c]);
    expect(d?.legs).toEqual(legs);
    expect(d?.loopLeg?.id).toBe(3);
    expect(d?.loopBack).toBe(true);
  });

  it("keeps a single dropped point", () => {
    const s = memoryStorage();
    writeDraft({ anchors: [a], legs: [], loopLeg: null, loopBack: false, discipline: "road" }, s, 0);
    expect(readDraft(s, 1)?.anchors).toEqual([a]);
    expect(readDraft(s, 1)?.loopBack).toBe(false);
  });

  it("drops stale, cleared, inconsistent or junk drafts", () => {
    const s = memoryStorage();
    writeDraft({ anchors: [a, b], legs: [leg(1, a, b)], loopLeg: null, loopBack: false, discipline: "road" }, s, 0);
    expect(readDraft(s, DRAFT_TTL_MS + 1)).toBeNull();
    clearDraft(s);
    expect(readDraft(s, 1)).toBeNull();
    // Legs that do not match the pins are not what the rider left.
    writeDraft({ anchors: [a, b, c], legs: [leg(1, a, b)], loopLeg: null, loopBack: false, discipline: "road" }, s, 0);
    expect(readDraft(s, 1)).toBeNull();
    s.setItem(DRAFT_KEY, "{oops");
    expect(readDraft(s, 1)).toBeNull();
    expect(readDraft(null)).toBeNull();
  });
});
