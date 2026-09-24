import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, pageOpenGraph, siteUrl } from "@/lib/site-meta";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import JsonLd from "@/components/JsonLd";

export const metadata: Metadata = {
  title: "Switching from Komoot? Your Routes Come With You | LOOPS",
  description:
    "Leaving Komoot after the Bending Spoons takeover and the device-sync paywall? LOOPS keeps GPX import and export — and free GPX to your Garmin, Wahoo or Hammerhead — free forever. Bulk-import your routes in minutes.",
  keywords: [
    "Komoot alternative",
    "switch from Komoot",
    "Komoot device sync paywall",
    "Komoot Bending Spoons",
    "free GPX import export",
    "Komoot to Garmin sync free",
    "cycling route planner",
  ],
  alternates: { canonical: siteUrl("/switch") },
  openGraph: pageOpenGraph({
    path: "/switch",
    title: "Switching from Komoot? Your Routes Come With You",
    description:
      "GPX import & export free forever. Free GPX to your Garmin, Wahoo or Hammerhead. No region locks. Your routes stay yours. Here's how to move from Komoot to LOOPS.",
  }),
  twitter: {
    card: "summary_large_image",
    title: "Switching from Komoot? Your Routes Come With You",
    description:
      "GPX import & export free forever. Free GPX to your Garmin, Wahoo or Hammerhead. No region locks. Move your routes to LOOPS in minutes.",
    images: [DEFAULT_OG_IMAGE.url],
  },
};

const PROMISES = [
  {
    title: "GPX import & export — free forever",
    body: "Bring every route in, take every route out. Standard GPX, no premium tier for your own files.",
  },
  {
    title: "Free GPX to your device — forever",
    body: "Download any route as a standard GPX and load it onto your Garmin, Wahoo or Hammerhead — no yearly fee for the privilege. (One-tap sync straight to the device is coming.)",
  },
  {
    title: "No region locks",
    body: "Every route, every country, from day one. Nothing to unlock, nowhere you can't plan.",
  },
  {
    title: "Your routes stay yours",
    body: "Import a whole folder in one go. They're your rides — we never hold them hostage.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Export your routes from Komoot",
    body: "On Komoot, open each planned route or tour and choose Export GPX (web: the ··· menu → Export; app: the share/export option). Save the .gpx files to a folder on your computer. This is your data — Komoot still lets you take it.",
  },
  {
    n: "2",
    title: "Bulk-import them to LOOPS",
    body: "Head to the upload page and drop the whole folder of GPX files in at once — up to 30 per batch. LOOPS parses each one, and you get a list showing exactly which routes imported, each with a link straight to it.",
    cta: { label: "Open bulk import", href: "/upload" },
  },
  {
    n: "3",
    title: "Load it onto your Garmin — free",
    body: "Open any route on LOOPS and download the GPX to your head unit — Garmin Connect, Wahoo, Hammerhead or any app that takes GPX. No subscription between you and the handoff to your bike computer. (One-tap sync straight to the device is coming.)",
  },
];

function howToJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to switch from Komoot to LOOPS",
    description:
      "Move your cycling routes from Komoot to LOOPS: export your GPX files, bulk-import them, and load them free onto your Garmin.",
    step: STEPS.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.body,
      url: `https://www.loops.ie/switch#step-${s.n}`,
    })),
  };
}

export default function SwitchPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <JsonLd data={howToJsonLd()} />
      <AppHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="px-4 md:px-6 pt-12 pb-10">
          <div className="max-w-2xl mx-auto">
            <span
              className="inline-block text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-4"
              style={{ background: "var(--accent-glow)", color: "var(--accent)" }}
            >
              Coming from Komoot?
            </span>
            <h1
              className="text-3xl md:text-5xl font-black tracking-tight leading-[1.05] mb-4"
              style={{ color: "var(--text)" }}
            >
              Switching from Komoot? Your routes come with you.
            </h1>
            <p className="text-base md:text-lg leading-relaxed mb-6" style={{ color: "var(--text-secondary)" }}>
              GPX import and export, free forever. Free GPX to your Garmin, Wahoo or Hammerhead.
              No region locks. Your routes stay yours. Moving over takes a few minutes — here&apos;s
              exactly how.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/upload"
                className="btn-accent inline-flex items-center justify-center font-bold text-sm uppercase tracking-wider px-6 py-3.5 rounded-xl"
              >
                Bulk-import my routes
              </Link>
              <Link
                href="#steps"
                className="inline-flex items-center justify-center font-bold text-sm uppercase tracking-wider px-6 py-3.5 rounded-xl"
                style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              >
                See the 3 steps
              </Link>
            </div>
          </div>
        </section>

        {/* What changed at Komoot */}
        <section className="px-4 md:px-6 py-8" style={{ background: "var(--bg-raised)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl md:text-2xl font-black tracking-tight mb-4" style={{ color: "var(--text)" }}>
              What changed at Komoot
            </h2>
            <div className="space-y-3 text-sm md:text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              <p>
                In March 2025 Komoot was acquired by Bending Spoons. In the months that followed,
                around 85% of the staff were let go, and syncing a route to your device — the single
                most basic thing a cyclist does with a route planner — moved behind a €59.99-a-year
                paywall.
              </p>
              <p>
                None of that is a knock on the people who built Komoot. It&apos;s just the reality of
                where the product is now, and it&apos;s why a lot of riders are looking for somewhere
                their routes and their device handoff aren&apos;t held for ransom. If that&apos;s you,
                read on.
              </p>
              <p className="text-sm">
                Want the longer version for road riders?{" "}
                <Link
                  href="/blog/komoot-alternative-for-road-cyclists"
                  className="font-semibold underline underline-offset-2"
                  style={{ color: "var(--accent)" }}
                >
                  Read our full Komoot alternative guide
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        {/* Our promise */}
        <section className="px-4 md:px-6 py-10">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl md:text-2xl font-black tracking-tight mb-2" style={{ color: "var(--text)" }}>
              Our promise, in writing
            </h2>
            <p className="text-sm md:text-base leading-relaxed mb-6" style={{ color: "var(--text-secondary)" }}>
              Everything Komoot put behind a paywall, we keep free forever. Routes and GPX are free
              forever. Pro (coming) adds training intelligence — never a charge for access to your
              own routes.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PROMISES.map((p) => (
                <div
                  key={p.title}
                  className="rounded-xl p-4"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                >
                  <div className="flex items-start gap-2.5">
                    <svg
                      className="w-5 h-5 shrink-0 mt-0.5"
                      style={{ color: "var(--accent)" }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <div>
                      <h3 className="text-sm font-bold mb-1" style={{ color: "var(--text)" }}>
                        {p.title}
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                        {p.body}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3-step walkthrough */}
        <section id="steps" className="px-4 md:px-6 py-10" style={{ background: "var(--bg-raised)", borderTop: "1px solid var(--border)" }}>
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl md:text-2xl font-black tracking-tight mb-6" style={{ color: "var(--text)" }}>
              Move your routes in 3 steps
            </h2>
            <div className="space-y-4">
              {STEPS.map((s) => (
                <div
                  key={s.n}
                  id={`step-${s.n}`}
                  className="rounded-xl p-5 flex gap-4"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                >
                  <div
                    className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-black text-base"
                    style={{ background: "var(--accent)", color: "var(--bg)" }}
                    aria-hidden="true"
                  >
                    {s.n}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold mb-1.5" style={{ color: "var(--text)" }}>
                      {s.title}
                    </h3>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {s.body}
                    </p>
                    {s.cta && (
                      <Link
                        href={s.cta.href}
                        className="btn-accent inline-flex items-center justify-center min-h-[44px] font-bold text-xs uppercase tracking-wider px-4 py-2.5 rounded-lg mt-3"
                      >
                        {s.cta.label}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="px-4 md:px-6 py-12">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-3" style={{ color: "var(--text)" }}>
              Ready when you are
            </h2>
            <p className="text-sm md:text-base leading-relaxed mb-6 max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
              Bring your rides across, keep them free, and see what a route planner built around one
              question — where should I ride today? — feels like.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/upload"
                className="btn-accent inline-flex items-center justify-center font-bold text-sm uppercase tracking-wider px-6 py-3.5 rounded-xl"
              >
                Import my Komoot routes
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center font-bold text-sm uppercase tracking-wider px-6 py-3.5 rounded-xl"
                style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              >
                See pricing
              </Link>
            </div>
          </div>
        </section>
      </main>

    </div>
  );
}
