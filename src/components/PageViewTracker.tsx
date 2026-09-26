"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Counts page views for /admin → Traffic (cookie-free, first-party; see
 * src/lib/traffic.ts). The first page of a visit also says where the visit
 * came from (referrer / utm_source). Automated browsers are not counted.
 */
export default function PageViewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      if (!pathname || /^\/(admin|api)(\/|$)/.test(pathname)) return;
      if (navigator.webdriver) return; // test runs and bots
      let entry = false;
      try {
        entry = !sessionStorage.getItem("loops:visit");
        sessionStorage.setItem("loops:visit", "1");
      } catch { entry = true; }
      const q = new URLSearchParams(window.location.search);
      const payload = JSON.stringify({
        p: pathname,
        ...(entry ? { e: 1, r: document.referrer || undefined, s: q.get("utm_source") || undefined } : {}),
      });
      const blob = new Blob([payload], { type: "application/json" });
      if (!navigator.sendBeacon?.("/api/pv", blob)) {
        void fetch("/api/pv", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
      }
    } catch {
      /* analytics never breaks the app */
    }
  }, [pathname]);
  return null;
}
