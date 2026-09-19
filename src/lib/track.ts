// ============================================================
// track.ts — client-side analytics beacon (browser only)
// ============================================================
//
// Fire-and-forget event reporting for things that only happen in the browser
// (client-side GPX downloads, the "route drawn" milestone). Uses sendBeacon so
// it survives the page being navigated/closed, and never throws or blocks the
// UI. Server-side events are recorded at their own API routes, not here.

export function track(event: string, properties?: Record<string, string | number | boolean>): void {
  try {
    if (typeof window === "undefined") return;
    const payload = JSON.stringify({ event, properties: properties ?? {} });

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/events", blob);
      return;
    }
    // Fallback: keepalive fetch, errors swallowed.
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never break the app.
  }
}
