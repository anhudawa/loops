import { test as base, expect, type Page, type Response as PageResponse, type Route } from "@playwright/test";

/**
 * Production smoke suite — READ-ONLY.
 *
 * Runs against BASE_URL (playwright.config.ts; default https://www.loops.ie)
 * on iPhone 13 emulation. It never signs in and never mutates anything:
 * every non-GET request is blocked, except the POST /api/routes/quality
 * scoring call a route page makes on its own (the /api/auth session check
 * is a GET), and a test FAILS if the page attempts any other mutating
 * request. Safe to point at production at any time.
 */

const RIDE_ID = "6565324e-8187-4cbd-ad69-f612cdd01d90";
const RIDE_PATH = `/ride/${RIDE_ID}?t=2026-09-26T09:00&m=Clontarf%20Rd`;
const RIDE_WHEN = "Sat 26 Sep · 9:00";
const RIDE_MEET = "Clontarf Rd";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Same-origin POSTs a route page makes by itself (scoring is idempotent). */
const ALLOWED_POSTS = [/^\/api\/routes\/quality$/];

/** Let a request through, or block it — either is a no-op once the page has moved on. */
const serve = (route: Route) => route.continue().catch(() => {});
const block = (route: Route) => route.abort("blockedbyclient").catch(() => {});

const test = base.extend<{ readOnly: void }>({
  readOnly: [
    async ({ context, baseURL }, use) => {
      const origin = new URL(baseURL ?? "https://www.loops.ie").origin;
      const attempted: string[] = [];
      await context.route("**/*", (route) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        if (SAFE_METHODS.has(method)) return serve(route);
        const url = new URL(req.url());
        if (method === "POST" && url.origin === origin && ALLOWED_POSTS.some((re) => re.test(url.pathname))) {
          return serve(route);
        }
        attempted.push(`${method} ${url.href}`);
        return block(route);
      });
      await use();
      expect(attempted, "the page attempted mutating requests — the smoke suite is read-only").toEqual([]);
    },
    { auto: true },
  ],
});

/** page.goto with a retry: a first load through a proxy occasionally fails outright. */
async function open(page: Page, path: string): Promise<PageResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      if (res) return res;
      lastError = new Error(`no response for ${path}`);
    } catch (err) {
      lastError = err;
    }
    await page.waitForTimeout(1500 * attempt);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * A route page renders client-side once /api/routes/<id> answers: wait for
 * its one h1. A first load that dropped a JS chunk (blank shell) gets one
 * reload before the test gives up.
 */
async function openRoute(page: Page, path: string): Promise<PageResponse> {
  let res = await open(page, path);
  const h1 = page.locator("h1");
  try {
    await expect(h1).toHaveCount(1, { timeout: 30_000 });
  } catch {
    res = (await page.reload({ waitUntil: "domcontentloaded" })) ?? res;
    await expect(h1).toHaveCount(1, { timeout: 45_000 });
  }
  await expect(h1).not.toHaveText(/route not found/i);
  return res;
}

// ── 1. Group-ride link ────────────────────────────────────────────────────

test.describe("group-ride link", () => {
  test("unfurls with the ride's day, time and image", async ({ page }) => {
    const res = await open(page, RIDE_PATH);
    expect(res.status()).toBe(200);
    await expect(page.locator('meta[property="og:title"]').first()).toHaveAttribute("content", new RegExp(RIDE_WHEN));
    await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", new RegExp(`/api/og/${RIDE_ID}`));
  });

  test("shows the ride banner, one h1, the forecast and the map", async ({ page }) => {
    await openRoute(page, RIDE_PATH);

    const banner = page.getByTestId("ride-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(RIDE_WHEN);
    await expect(banner).toContainText(`Meet: ${RIDE_MEET}`);
    await expect(page.locator("h1")).toHaveCount(1);

    // Forecast for the ride time, or current conditions once that has passed.
    await expect(page.getByRole("heading", { name: /^(Forecast ·|Weather now)/ })).toBeVisible({ timeout: 45_000 });

    // Leaflet marks the container once the map is up.
    await expect(page.locator("#map.leaflet-container")).toBeVisible();
  });

  test("Forward this ride opens the share sheet; Escape closes it", async ({ page }) => {
    await openRoute(page, RIDE_PATH);

    // The page paints from the server before it is interactive (~0.5 s);
    // tap again until the sheet opens, as a rider would.
    const sheetTitle = page.getByRole("heading", { name: "Forward this ride" });
    await expect(async () => {
      await page.getByRole("button", { name: "Forward this ride" }).click();
      await expect(sheetTitle).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    // The ride's own day and time are pre-filled, so sending is possible at once.
    await expect(page.getByRole("button", { name: /send on whatsapp/i })).toBeEnabled();
    await expect(page.getByTestId("share-story")).toBeEnabled();
    // The ride link on its own, one tap to copy (the story's Link sticker).
    await expect(page.getByTestId("copy-ride-link")).toContainText("loops.ie/ride/");

    await page.keyboard.press("Escape");
    await expect(sheetTitle).toBeHidden();
  });

  test("roll call: signed out, sign up / log in to confirm attendance", async ({ page }) => {
    await openRoute(page, RIDE_PATH);
    const roll = page.getByTestId("roll-call");
    await expect(roll).toBeVisible({ timeout: 20_000 });
    await expect(roll.getByText("Are you riding? Confirm your attendance")).toBeVisible();
    const signup = roll.getByTestId("roll-call-signup");
    await expect(signup).toBeVisible();
    // Both buttons come back to this exact ride (day, time, meet).
    await signup.click();
    await expect(page).toHaveURL(/\/login\?mode=signup&redirect=%2Fride%2F/);
    await expect(page.getByRole("heading", { name: "Sign up to confirm your attendance" })).toBeVisible();
  });

  test("ride calendar entry: floating 9:00 with the meeting point", async ({ page }) => {
    const res = await page.request.get(`/api/rides/calendar?route=${RIDE_ID}&t=2026-09-26T09:00&m=Clontarf%20Rd`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/calendar");
    const ics = await res.text();
    expect(ics).toContain("DTSTART:20260926T090000\r\n");
    expect(ics).toContain("LOCATION:Clontarf Rd");
  });

  test("Instagram story card renders 1080×1920", async ({ page }) => {
    const res = await page.request.get(`/api/og/${RIDE_ID}/story?t=2026-09-26T09:00&m=Clontarf%20Rd`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
    const png = await res.body();
    // PNG header: width and height are big-endian at bytes 16–23.
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBe(1920);
  });
});

// ── 2. Plain route page ───────────────────────────────────────────────────

test("route page: title strip, invite and GPX call to action", async ({ page }) => {
  await openRoute(page, `/routes/${RIDE_ID}`);
  const name = (await page.locator("h1").textContent())?.trim() ?? "";
  expect(name).not.toBe("");

  // Phone-width strip above the map: name + "83.4 km · +554 m · Dublin".
  const strip = page.locator('div[class~="md:hidden"]', { hasText: /\d km · \+\d+ m · / }).first();
  await expect(strip).toBeVisible();
  await expect(strip).toContainText(name);

  await expect(page.getByRole("button", { name: "Invite friends to ride" })).toBeVisible();
  // Signed out: either the free download or the sign-up route to it (GPX_ACCESS).
  await expect(page.getByRole("link", { name: /download gpx/i }).first()).toBeVisible();
});

// ── 3. Login with a ride redirect ─────────────────────────────────────────

test("login keeps the ride redirect and offers Google and email", async ({ page }) => {
  const res = await open(page, `/login?redirect=${encodeURIComponent(RIDE_PATH)}`);
  expect(res.status()).toBe(200);
  await expect(page.getByRole("button", { name: /continue with google/i }).first()).toBeVisible();
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
  await expect(page.getByRole("button", { name: /email me/i })).toBeVisible();
  await expect(page.getByTestId("login-return-context")).toBeVisible();
});

// ── 4. Public pages ───────────────────────────────────────────────────────

const PUBLIC_PAGES = ["/", "/cycling", "/cycling/girona", "/collections", "/routes/country/ireland", "/privacy", "/pricing"];

for (const path of PUBLIC_PAGES) {
  test(`public page ${path}: 200, canonical and og:image`, async ({ page }) => {
    const res = await open(page, path);
    expect(res.status()).toBe(200);
    // The canonical is always the www URL, whatever deployment is under test.
    const canonical = path === "/" ? "https://www.loops.ie" : `https://www.loops.ie${path}`;
    await expect(page.locator('link[rel="canonical"]').first()).toHaveAttribute("href", canonical);
    await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", /^https?:\/\/.+/);
  });
}

// ── 5. Privacy invariants ─────────────────────────────────────────────────

const PRIVATE_ROUTE_KEYS = ["operator_name", "operator_url", "created_by", "strava_activity_id", "avg_score"];

test("route JSON carries no private provenance", async ({ page }) => {
  const res = await open(page, `/api/routes/${RIDE_ID}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;
  const route = (body.data ?? body) as Record<string, unknown>;
  expect(route.id).toBe(RIDE_ID);
  for (const key of PRIVATE_ROUTE_KEYS) {
    expect(route, `${key} must not be public`).not.toHaveProperty(key);
  }
});

test("engine status tells anonymous callers nothing about the server", async ({ page }) => {
  const res = await open(page, "/api/engine/status");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  for (const key of ["host", "ip", "engine", "expected"]) {
    expect(data, `${key} is admin-only`).not.toHaveProperty(key);
  }
  expect(JSON.stringify(body)).not.toMatch(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
});

// ── 6. Not found ──────────────────────────────────────────────────────────

for (const path of ["/ride/not-a-real-id", "/routes/not-a-real-id"]) {
  test(`${path} is a 404`, async ({ page }) => {
    const res = await open(page, path);
    expect(res.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/404|not found/i);
  });
}

test.describe("Road Standard (Trust Rule)", () => {
  test("the ride page carries a Road Standard card", async ({ page }) => {
    await openRoute(page, RIDE_PATH);
    const card = page.getByTestId("road-standard");
    await expect(card).toBeVisible({ timeout: 30000 });
    await expect(card).toContainText(/Meets the (?:Loops road standard|LOOPS Road Standard)|Compromise:/);
  });

  test("a route with compromises lists every stretch under Where", async ({ page }) => {
    // Loop of Mallorca: an operator route with many named main-road stretches.
    await openRoute(page, "/routes/02aa7733-1765-4bbc-9427-2aa081c06da2");
    const card = page.getByTestId("road-standard");
    await expect(card).toBeVisible({ timeout: 30000 });
    await expect(card).toContainText("Compromise:");
    await card.locator("summary").click();
    const items = card.locator("li");
    expect(await items.count()).toBeGreaterThan(3);
    await expect(items.first()).toContainText(/km on|m on/);
  });
});

test.describe("log in vs sign up", () => {
  test("'Log in' lands on a login page and nothing else", async ({ page }) => {
    await open(page, "/login");
    await expect(page.getByRole("heading", { level: 1, name: /log in to loops/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toHaveCount(1);
    // Login is only for logging in: no demo, stats or route pitch.
    await expect(page.getByText(/answers waiting inside|try it|km mapped/i)).toHaveCount(0);
  });
  test("'Sign up' is just as plain, with a way back to log in", async ({ page }) => {
    await open(page, "/login?mode=signup");
    await expect(page.getByRole("heading", { level: 1, name: /create your free account/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toHaveCount(1);
    await expect(page.getByRole("link", { name: /already have an account\? log in/i })).toBeVisible();
  });
});

test.describe("login wall says the right thing", () => {
  test("the planner gate never greets a new rider with 'Welcome back'", async ({ page }) => {
    await open(page, "/generate");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fgenerate/);
    await expect(page.getByRole("heading", { level: 1, name: /log in to plan a ride/i })).toBeVisible();
  });
  test("an unknown URL is the 404 page, not the login wall", async ({ page }) => {
    const res = await open(page, "/nope-404");
    expect(res.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("404");
  });
  test("pricing 'Create a free account' opens the sign-up page", async ({ page }) => {
    await open(page, "/pricing");
    await expect(page.getByRole("link", { name: /create a free account/i })).toHaveAttribute("href", /mode=signup/);
  });
});

// WCAG 2 A/AA (axe-core): contrast, labels, landmarks on the pages riders
// reach first. Serious or critical violations fail.
test.describe("accessibility (axe, WCAG AA)", () => {
  const AXE = require("fs").readFileSync(require.resolve("axe-core/axe.min.js"), "utf8") as string;
  for (const path of ["/", RIDE_PATH, "/login", "/cycling/dublin"]) {
    test(`no serious violations on ${path.split("?")[0]}`, async ({ page }) => {
      await open(page, path);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.addScriptTag({ content: AXE });
      const violations = await page.evaluate(async () => {
        const w = window as unknown as { axe: { run: (d: Document, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string; nodes: Array<{ html: string }> }> }> } };
        const r = await w.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
        return r.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => `${v.id} ×${v.nodes.length}: ${v.nodes[0]?.html.slice(0, 120)}`);
      });
      expect(violations).toEqual([]);
    });
  }
});
