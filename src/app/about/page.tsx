import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import { pageMeta } from "@/lib/site-meta";

const DESCRIPTION =
  "LOOPS is cycling route discovery built by riders, for riders. Routes and GPX are free forever. Pro (coming) adds training intelligence.";

export const metadata: Metadata = {
  title: "About | LOOPS",
  description: DESCRIPTION,
  ...pageMeta({ path: "/about", title: "About LOOPS", description: DESCRIPTION }),
};

export default function AboutPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader />

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-12">
        <h1 className="text-2xl font-extrabold mb-6" style={{ color: "var(--text)" }}>About LOOPS</h1>

        <div className="space-y-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <p>
            LOOPS is a cycling route discovery platform. We believe great routes shouldn&apos;t
            be locked behind paywalls: routes and GPX are free forever. Pro (coming) adds training
            intelligence. Our library routes follow the roads local riders actually use,
            and every generated route is scored against real road data with hard safety guardrails.
          </p>
          <p>
            LOOPS is built for road riders: quiet, paved roads, measured and named.
            Download any route as a GPX file and load it into Strava, Komoot, Wahoo, Garmin, or any
            app that supports GPX.
          </p>
          <p>
            LOOPS is built and maintained in Ireland. If you have questions or want to get in touch,
            reach out at{" "}
            <a href="mailto:hello@loops.ie" className="font-bold hover:opacity-80 py-3.5" style={{ color: "var(--accent)" }}>
              hello@loops.ie
            </a>.
          </p>
        </div>
      </div>
    </div>
  );
}
