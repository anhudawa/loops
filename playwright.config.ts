import { defineConfig, devices } from "@playwright/test";

/**
 * Production smoke suite (tests/smoke.spec.ts) — read-only, against BASE_URL.
 *
 *   npm run smoke                                   # https://www.loops.ie
 *   BASE_URL=https://loops-git-x.vercel.app npm run smoke   # any deployment
 *   PW_SANDBOX=1 npm run smoke                      # Claude Code sandbox
 *
 * PW_SANDBOX uses the sandbox's own Chromium, launched with
 * --proxy-server=$HTTPS_PROXY (the egress proxy re-terminates TLS, hence
 * ignoreHTTPSErrors). Chromium's own tunnels through that proxy are slow and
 * drop about one request in six (net::ERR_TOO_MANY_RETRIES), so the suite
 * serves every request through Playwright's request context instead (see the
 * `readOnly` fixture) — `proxy` here points that context at the same proxy.
 * CI and laptops use the browser Playwright installed
 * (`npx playwright install chromium`) and talk to the site directly.
 */
const sandbox = !!process.env.PW_SANDBOX;

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
    // Requests from a service worker bypass page routing; the read-only
    // guard in the suite must see every request.
    serviceWorkers: "block",
    ...(sandbox
      ? {
          ignoreHTTPSErrors: true,
          ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
          launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
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
