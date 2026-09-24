import { describe, expect, it } from "vitest";
import { communityDecision, isTrainingLoop, provenLabel, nextAskAt, MAX_ASKS, type CommunityState } from "@/lib/ride-check";

/** A circle of ~`km` km starting and ending at the same point. */
function loop(km: number): [number, number][] {
  const r = km / (2 * Math.PI) / 111.32;
  return Array.from({ length: 400 }, (_, i) => {
    const a = (i / 399) * 2 * Math.PI;
    return [53.36 + r * Math.sin(a), -6.2 + (r * (1 - Math.cos(a))) / Math.cos((53.36 * Math.PI) / 180)] as [number, number];
  });
}
/** A straight line north (a commute: ends far from the start). */
function line(km: number): [number, number][] {
  return Array.from({ length: 200 }, (_, i) => [53.36 + (km / 111.32) * (i / 199), -6.2] as [number, number]);
}

describe("isTrainingLoop", () => {
  it("a 60 km loop from Clontarf back to Clontarf is a training loop", () => {
    expect(isTrainingLoop(loop(60), 60).ok).toBe(true);
  });
  it("a commute (A to B) is not", () => {
    const v = isTrainingLoop(line(25), 25);
    expect(v.ok).toBe(false);
    expect(v.why).toMatch(/A to B/);
  });
  it("there and back on the same road is not", () => {
    const out = line(15);
    const v = isTrainingLoop([...out, ...out.slice().reverse()], 30);
    expect(v.ok).toBe(false);
  });
  it("a spin round the block is not a training ride", () => {
    expect(isTrainingLoop(loop(8), 8).ok).toBe(false);
  });
});

const base: CommunityState = { creatorRode: true, creatorScore: 5, ratings: [5], trainingLoop: { ok: true }, roadsOk: true };

describe("communityDecision", () => {
  it("offered to others only once the creator rode it and rated it 4+", () => {
    expect(communityDecision(base)).toBe("offer");
    expect(communityDecision({ ...base, creatorScore: 4 })).toBe("offer");
    expect(communityDecision({ ...base, creatorScore: 3 })).toBe("hold");
    expect(communityDecision({ ...base, creatorRode: null, creatorScore: null, ratings: [] })).toBe("hold");
    expect(communityDecision({ ...base, creatorRode: false, creatorScore: null })).toBe("hold");
  });
  it("never offered when it isn't a training loop or its roads fail the standard", () => {
    expect(communityDecision({ ...base, trainingLoop: { ok: false, why: "A to B" } })).toBe("hold");
    expect(communityDecision({ ...base, roadsOk: false })).toBe("hold");
  });
  it("riders who rode it can take it down (3+ ratings averaging under 3.5)", () => {
    expect(communityDecision({ ...base, ratings: [5, 3, 2] })).toBe("drop");
    expect(communityDecision({ ...base, ratings: [5, 4, 2] })).toBe("offer");
    expect(communityDecision({ ...base, ratings: [5, 2] })).toBe("offer");
  });
});

describe("labels and asking", () => {
  it("proof never names anyone", () => {
    expect(provenLabel(1, 5)).toBe("Ridden and rated ★ 5.0 by a LOOPS rider");
    expect(provenLabel(5, 4.62)).toBe("Ridden and rated ★ 4.6 by 5 LOOPS riders");
    expect(provenLabel(0, null)).toBeNull();
  });
  it("'not yet' asks again in two days, then stops", () => {
    const now = new Date("2026-09-24T12:00:00Z");
    expect(nextAskAt(now, 1)?.toISOString()).toBe("2026-09-26T12:00:00.000Z");
    expect(nextAskAt(now, MAX_ASKS)).toBeNull();
  });
});
