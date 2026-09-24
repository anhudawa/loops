/**
 * A local stand-in for POST /api/reroute (the real handler, sign-in stubbed)
 * so a browser test can drive the real Draw screen against a real engine.
 *   DRAW_SERVER=1 BROUTER_URL=… npx vitest run src/lib/__tests__/draw-server.test.ts
 * Listens on DRAW_SERVER_PORT (3999) for DRAW_SERVER_MINUTES (60).
 */
import { it, vi } from "vitest";
import http from "node:http";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", async (orig) => ({
  ...(await orig<typeof import("@/lib/db")>()),
  getUserBySession: async (token: string) => ({ id: token || "ui", email: "ui@example.com", name: "UI", role: "user" }),
}));
import { POST } from "@/app/api/reroute/route";

it.skipIf(!process.env.DRAW_SERVER)("serves /api/reroute", async () => {
  const port = Number(process.env.DRAW_SERVER_PORT ?? 3999);
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const r = await POST(new NextRequest("http://localhost/api/reroute", { method: "POST", headers: { "content-type": "application/json", cookie: "session=ui" }, body }));
    res.writeHead(r.status, { "content-type": "application/json" });
    res.end(await r.text());
  });
  await new Promise<void>((ok) => server.listen(port, ok));
  await new Promise((ok) => setTimeout(ok, Number(process.env.DRAW_SERVER_MINUTES ?? 60) * 60_000));
  server.close();
}, 3 * 60 * 60 * 1000);
