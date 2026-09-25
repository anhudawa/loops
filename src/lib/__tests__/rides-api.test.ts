import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// In-memory stand-ins for the database functions the rides API uses.
const rides = new Map<string, { id: string; route_id: string; starts_at: string; meet: string; creator_id: string | null }>();
const rsvps = new Map<string, { ride_id: string; user_id: string; status: "yes" | "maybe" | "no" }>();
const users: Record<string, { id: string; name: string }> = { s1: { id: "u1", name: "Anthony Walsh" }, s2: { id: "u2", name: "Conor" } };
vi.mock("@/lib/db", () => ({
  getUserBySession: async (t: string) => users[t] ?? null,
  upsertGroupRide: async (route_id: string, starts_at: string, meet: string, creator_id: string | null) => {
    const k = `${route_id}|${starts_at}|${meet}`;
    const r = rides.get(k) ?? { id: `r${rides.size + 1}`, route_id, starts_at, meet, creator_id: null };
    r.creator_id = r.creator_id ?? creator_id;
    rides.set(k, r);
    return r;
  },
  findGroupRide: async (route_id: string, starts_at: string, meet: string) => rides.get(`${route_id}|${starts_at}|${meet}`) ?? null,
  setRideRsvp: async (ride_id: string, user_id: string, status: "yes" | "maybe" | "no") => { rsvps.set(`${ride_id}|${user_id}`, { ride_id, user_id, status }); },
  getRollCall: async (ride_id: string) => [...rsvps.values()].filter((r) => r.ride_id === ride_id)
    .map((r) => ({ ...r, name: Object.values(users).find((u) => u.id === r.user_id)?.name ?? null, avatar_url: null })),
}));
import { GET, POST } from "@/app/api/rides/route";

const ROUTE = "6565324e-8187-4cbd-ad69-f612cdd01d90";
const req = (method: string, session?: string, body?: unknown, q = "") =>
  new NextRequest(`http://x/api/rides${q}`, { method, headers: { "content-type": "application/json", ...(session ? { cookie: `session=${session}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });

describe("rides API", () => {
  it("sharing saves the ride with its creator; answering adds to the roll call", async () => {
    let r = await POST(req("POST", "s1", { route_id: ROUTE, t: "2026-09-26T09:00", m: "Clontarf Rd" }));
    expect(r.status).toBe(200);
    expect([...rides.values()][0].creator_id).toBe("u1");
    r = await POST(req("POST", "s2", { route_id: ROUTE, t: "2026-09-26T09:00", m: "Clontarf  Rd", status: "yes" }));
    const b = await r.json();
    expect(b.data.counts.yes).toBe(1);
    expect(b.data.mine).toBe("yes");
    expect([...rides.values()][0].creator_id).toBe("u1"); // an answer never takes the ride over
    await POST(req("POST", "s1", { route_id: ROUTE, t: "2026-09-26T09:00", m: "Clontarf Rd", status: "maybe" }));
  });
  it("everyone sees counts; only signed-in riders see first names", async () => {
    const q = `?route=${ROUTE}&t=2026-09-26T09:00&m=Clontarf%20Rd`;
    const anon = await (await GET(req("GET", undefined, undefined, q))).json();
    expect(anon.data.counts).toEqual({ yes: 1, maybe: 1, no: 0 });
    expect(anon.data.names).toBeUndefined();
    const signed = await (await GET(req("GET", "s2", undefined, q))).json();
    expect(signed.data.names.yes).toEqual(["Conor"]);
    expect(signed.data.names.maybe).toEqual(["Anthony"]);
  });
  it("signed out cannot answer; bad input is refused", async () => {
    expect((await POST(req("POST", undefined, { route_id: ROUTE, t: "2026-09-26T09:00", status: "yes" }))).status).toBe(401);
    expect((await POST(req("POST", "s1", { route_id: "x", t: "2026-09-26T09:00" }))).status).toBe(400);
    expect((await POST(req("POST", "s1", { route_id: ROUTE, t: "tomorrow" }))).status).toBe(400);
  });
});
