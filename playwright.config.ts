import { defineConfig, devices } from "@playwright/test";

/**
 * Production smoke suite (tests/smoke.spec.ts) — read-only, against BASE_URL.
 *
 *   npm run smoke                                   # https://www.loops.ie
 *   BASE_URL=https://loops-git-x.vercel.app npm run smoke   # any deployment
 *   PW_SANDBOX=1 npm run smoke                      # Claude Code sandbox
 *
 * PW_SANDBOX uses the sandbox's own Chromium through the egress proxy
 * (HTTPS_PROXY, which re-terminates TLS — hence ignoreHTTPSErrors). It must
 * be Playwright's `proxy` option — a bare --proxy-server arg leaves Chromium
 * dropping about one request in six with net::ERR_TOO_MANY_RETRIES — and
 * the flags below keep its tunnels off HTTP/2, QUIC and background probes
 * (verified: 0 failed requests in 209). CI and laptops use the browser
 * Playwright installed (`npx playwright install chromium`) and talk to the
 * site directly.
 */
const sandbox = !!process.env.PW_SANDBOX;

const SANDBOX_CHROMIUM_ARGS = ["--disable-background-networking", "--disable-http2", "--ssl-version-max=tls1.2", "--disable-quic"];

export default defineConfig({
  testDir: "./tests",
  testMatch: /smoke\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: "list",
  // Production over a proxy: generous budgets, the tests fail on content,
  // not on a slow first byte.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.BASE_URL || "https://www.loops.ie",
    trace: "on-first-retry",
    navigationTimeout: 60_000,
    // The product's home turf: dates and times render the same on every run.
    locale: "en-IE",
    timezoneId: "Europe/Dublin",
    // Requests from a service worker bypass page routing; the read-only
    // guard in the suite must see every request.
    serviceWorkers: "block",
    ...(sandbox
      ? {
          ignoreHTTPSErrors: true,
          ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
          launchOptions: { executablePath: "/opt/pw-browsers/chromium", args: SANDBOX_CHROMIUM_ARGS },
        }
      : {}),
  },
  projects: [
    {
      name: "iphone",
      // iPhone 13 viewport, scale factor, touch and user agent — on Chromium,
      // the one browser every environment (including the sandbox) has.
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
