import { describe, it, expect } from "vitest";
import { renameGpx, gpxFileName, titleWithKm } from "@/lib/gpx-name";
import { asksRepeatEfforts, mentionsEfforts } from "@/lib/session-words";
import { parseBasicIntent } from "@/lib/route-intent";
import { exportBlockedReason } from "@/app/plan/plan-checks";
import { describeCompromise, unsuitableWhy, type Compromise } from "@/lib/road-segments";
import { readDraft, writeDraft, DRAFT_KEY } from "@/app/plan/plan-draft";
import { buildPlanGpx, type PlanLeg } from "@/lib/plan-legs";

describe("GPX names match the route's title (CLT-13, DRAW-13)", () => {
  const gpx = buildPlanGpx([[53.36, -6.2], [53.37, -6.21]], [5, 6], "LOOPS planned road route — 10.7 km", "road");

  it("renames the metadata and the track, not waypoints", () => {
    const withWpt = gpx.replace("  <trk>", '  <wpt lat="1" lon="2"><name>Road note: N81</name></wpt>\n  <trk>');
    const out = renameGpx(withWpt, "Clontarf – Raheny – Clontarf · 10.7 km");
    expect(out.match(/<metadata>\s*<name>([^<]*)/)![1]).toBe("Clontarf – Raheny – Clontarf · 10.7 km");
    expect(out.match(/<trk>\s*<name>([^<]*)/)![1]).toBe("Clontarf – Raheny – Clontarf · 10.7 km");
    expect(out).toContain("<name>Road note: N81</name>");
    expect(out).not.toContain("LOOPS planned");
  });

  it("escapes the name", () => {
    expect(renameGpx(gpx, "Cafés & climbs <3")).toContain("<name>Cafés &amp; climbs &lt;3</name>");
  });

  it("names the file after the title", () => {
    expect(gpxFileName("Clontarf – Raheny – Clontarf · 10.7 km")).toBe("loops-clontarf-raheny-clontarf-10-7-km.gpx");
    expect(gpxFileName("Port de Pollença – Cap de Formentor · 40 km", "-edited")).toBe("loops-port-de-pollenca-cap-de-formentor-40-km-edited.gpx");
    expect(gpxFileName("")).toBe("loops-route.gpx");
  });

  it("puts the page's distance on the title", () => {
    expect(titleWithKm("Clontarf – Raheny – Clontarf · 11 km", "10.7")).toBe("Clontarf – Raheny – Clontarf · 10.7 km");
    expect(titleWithKm("Ride along the coast", "10.7")).toBe("Ride along the coast");
  });
});

describe("the repeat question is asked for sessions, and only sessions (CA-12)", () => {
  it.each([
    "hill repeats from Bray",
    "over-unders from Maynooth",
    "4 by 4 minute efforts",
    "3 hill efforts on Howth",
    "a hard session",
    "4x4 VO2 from Clontarf",
    "2 x 20 min threshold intervals",
    "FTP test then 3x5 min",
  ])("asks for %s", (p) => expect(asksRepeatEfforts(p)).toBe(true));

  it.each(["FTP test", "ramp test from Clontarf", "2 hour ride from Bray", "easy spin, no hard efforts", "60 km scenic loop"])(
    "does not ask for %s",
    (p) => expect(asksRepeatEfforts(p)).toBe(false)
  );

  it("the parser reads the same words: efforts it cannot parse are declined, not dropped", () => {
    expect(mentionsEfforts("3 hill efforts on Howth")).toBe(true);
    expect(parseBasicIntent("3 hill efforts from Howth")).toBeNull();
    expect(parseBasicIntent("easy spin, no hard efforts from Bray")?.workout ?? null).toBeNull();
  });

  it("reads '4 by 4 minute efforts' as 4x4", () => {
    const w = parseBasicIntent("4 by 4 minute efforts from Bray")?.workout;
    expect(w?.intervals[0]).toMatchObject({ count: 4, duration_minutes: 4 });
  });
});

describe("Save/GPX say why they cannot run yet (DRAW-15)", () => {
  const base = { anchors: 3, needsAuth: false, snapping: false, failed: 0, allSnapped: false };
  it("goes ahead once every leg is snapped", () => {
    expect(exportBlockedReason({ ...base, allSnapped: true }, "save")).toBeNull();
  });
  it("names the reason", () => {
    expect(exportBlockedReason({ ...base, anchors: 0 }, "save")).toMatch(/Tap the map/);
    expect(exportBlockedReason({ ...base, anchors: 1 }, "export")).toMatch(/second point.*download the GPX/);
    expect(exportBlockedReason({ ...base, needsAuth: true }, "save")).toMatch(/^Sign in to save it/);
    expect(exportBlockedReason({ ...base, snapping: true }, "export")).toMatch(/Still snapping/);
    expect(exportBlockedReason({ ...base, failed: 2 }, "save")).toMatch(/2 legs couldn't snap.*Retry/);
  });
});

describe("unsuitable stretches say what they are and why (DRAW-08)", () => {
  const c = (over: Partial<Compromise>): Compromise => ({ kind: "unsuitable", start: 0, end: 5, meters: 787, highway: "cycleway", ...over });
  it("a cycleway is a cycle path, with the reason", () => {
    expect(describeCompromise(c({ why: "no_bikes" }))).toBe("787 m on a cycle path where bikes are not allowed");
    expect(describeCompromise(c({ why: "rough" }))).toMatch(/on a cycle path with a rough surface/);
    expect(describeCompromise(c({}))).toBe("787 m on a cycle path tagged unsuitable for bikes");
  });
  it("finds the reason from the tags", () => {
    expect(unsuitableWhy({ highway: "cycleway", bicycle: "no" }, "road")).toBe("no_bikes");
    expect(unsuitableWhy({ highway: "cycleway", smoothness: "bad" }, "road")).toBe("rough");
    expect(unsuitableWhy({ highway: "unclassified", ford: "yes" }, "road")).toBe("ford");
    expect(unsuitableWhy({ highway: "cycleway", "class:bicycle": "-2" }, "road")).toBe("poor_for_bikes");
  });
});

describe("the draft keeps Undo through a reload (DRAW-15)", () => {
  function memoryStorage() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  }
  const leg = (id: number, from: [number, number], to: [number, number]): PlanLeg => ({
    id, seq: id, from, to, coords: [from, to], elevations: [1, 2], distance_km: 1, gain_m: 1, loss_m: 0, status: "snapped",
  });
  const a: [number, number] = [53.58, -6.1], b: [number, number] = [53.5, -6.2], c: [number, number] = [53.45, -6.15];
  const l1 = leg(1, a, b), l2 = leg(2, b, c);

  it("stores each leg once and gives the history back", () => {
    const s = memoryStorage();
    const undo = [
      { anchors: [a], legs: [], loopLeg: null, loopBack: true },
      { anchors: [a, b], legs: [l1], loopLeg: null, loopBack: true },
    ];
    writeDraft({ anchors: [a, b, c], legs: [l1, l2], loopLeg: null, loopBack: true, discipline: "road", undo }, s, 1000);
    const stored = JSON.parse(s.m.get(DRAFT_KEY)!);
    expect(stored.history.pool).toHaveLength(1);
    const d = readDraft(s, 2000);
    expect(d?.undo).toEqual(undo);
    expect(d?.anchors).toEqual([a, b, c]);
  });

  it("a broken history is dropped, never the drawing", () => {
    const s = memoryStorage();
    writeDraft({ anchors: [a, b], legs: [l1], loopLeg: null, loopBack: true, discipline: "road" }, s, 1000);
    const raw = JSON.parse(s.m.get(DRAFT_KEY)!);
    s.m.set(DRAFT_KEY, JSON.stringify({ ...raw, history: { pool: [], steps: [{ anchors: [a, b], legs: [7], loopLeg: null, loopBack: true }] } }));
    const d = readDraft(s, 2000);
    expect(d?.anchors).toEqual([a, b]);
    expect(d?.undo).toEqual([]);
  });

  it("keeps the drawing without the history when storage is full", () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => void m.delete(k), setItem: (k: string, v: string) => { if (v.includes("history")) throw new Error("quota"); m.set(k, v); } };
    writeDraft({ anchors: [a, b], legs: [l1], loopLeg: null, loopBack: true, discipline: "road", undo: [{ anchors: [a], legs: [], loopLeg: null, loopBack: true }] }, s, 1000);
    expect(readDraft(s, 2000)?.anchors).toEqual([a, b]);
  });
});
