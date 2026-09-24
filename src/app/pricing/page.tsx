import type { Metadata } from "next";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import FreeAccountCta from "./FreeAccountCta";
import { DEFAULT_OG_IMAGE, pageOpenGraph, siteUrl } from "@/lib/site-meta";

// The one line of truth on price — the same sentence on every page.
const FREE_LINE = "Routes and GPX are free forever. Pro (coming) adds training intelligence.";

export const metadata: Metadata = {
  title: "Pricing — Free Forever, Plus Pro | LOOPS",
  description: `${FREE_LINE} GPX import/export, bulk import and your saved routes cost nothing. LOOPS Pro will be €39/yr; Founding Rider is €49 for Pro for life.`,
  keywords: [
    "LOOPS pricing",
    "free cycling route planner",
    "cycling route planner price",
    "Komoot alternative pricing",
    "LOOPS Pro",
    "Founding Rider",
  ],
  alternates: { canonical: siteUrl("/pricing") },
  openGraph: pageOpenGraph({
    path: "/pricing",
    title: "Pricing — Free Forever, Plus Pro | LOOPS",
    description: `${FREE_LINE} Everything Komoot paywalled stays free on LOOPS.`,
  }),
  twitter: {
    card: "summary_large_image",
    title: "Pricing — Free Forever, Plus Pro | LOOPS",
    description: `${FREE_LINE} Pro will be €39/yr.`,
    images: [DEFAULT_OG_IMAGE.url],
  },
};

const FREE_FEATURES = [
  "GPX import & export",
  "Bulk import (up to 30 files at once)",
  "Free GPX to Garmin, Wahoo & Hammerhead",
  "All your saved routes",
  "Draw-on-map route planner",
  "Browse all destinations",
  "AI route generation (3 a week once Pro launches)",
];

// Free, but not shipped yet — shown honestly as "coming", never as a live
// feature. One-tap sync pushes a route straight to the device from LOOPS
// (today you download the GPX and load it yourself, which is free and works).
const FREE_COMING = [
  "One-tap sync to Garmin, Wahoo & Hammerhead",
];

const PRO_FEATURES = [
  "Unlimited AI route generation",
  "Session-aware workout loops (2×20 on roads that hold it)",
  "Wind-planned rides (“tailwind home”, best start time)",
  "Climb alerts pushed to your head unit",
  "Everything in Free, forever",
];

const CONTACT_EMAIL = "hello@loops.ie";
const FOUNDING_SUBJECT = "Founding Rider — I'm in";
const FOUNDING_BODY =
  "Hi Anthony,\n\nI'd like to claim a Founding Rider spot (€49, Pro for life). Let me know how to pay.\n\nThanks!";
const foundingMailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  FOUNDING_SUBJECT
)}&body=${encodeURIComponent(FOUNDING_BODY)}`;

function Check() {
  return (
    <svg
      className="w-4 h-4 shrink-0 mt-0.5"
      style={{ color: "var(--accent)" }}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <AppHeader />

      <main id="main-content" className="flex-1">
        {/* Hero + promise */}
        <section className="px-4 md:px-6 pt-12 pb-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-[1.05] mb-4" style={{ color: "var(--text)" }}>
              Your routes are free. Forever.
            </h1>
            <p className="text-base md:text-lg font-semibold mb-3" style={{ color: "var(--text)" }}>
              {FREE_LINE}
            </p>
            <p className="text-base md:text-lg leading-relaxed max-w-2xl mx-auto" style={{ color: "var(--text-secondary)" }}>
              Everything Komoot put behind a paywall — GPX import and export, bulk import, free GPX
              to your device, your saved routes — is free on LOOPS and always will be. We charge for
              training intelligence, never for access to your own routes.
            </p>
          </div>
        </section>

        {/* Two-column plan table */}
        <section className="px-4 md:px-6 pb-6">
          <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Free forever */}
            <div className="rounded-2xl p-6 flex flex-col" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="mb-4">
                <h2 className="text-lg font-black uppercase tracking-wide" style={{ color: "var(--text)" }}>
                  Free forever
                </h2>
                <div className="flex items-baseline gap-1.5 mt-2">
                  <span className="text-3xl font-black" style={{ color: "var(--text)" }}>€0</span>
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>always</span>
                </div>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  Genuinely good on its own — better than Komoot&apos;s free tier is now.
                </p>
              </div>
              <ul className="space-y-2.5 flex-1">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    <Check />
                    <span>{f}</span>
                  </li>
                ))}
                {FREE_COMING.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    <span className="shrink-0 mt-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                      Soon
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <FreeAccountCta />
            </div>

            {/* Pro */}
            <div className="rounded-2xl p-6 flex flex-col relative" style={{ background: "var(--bg-card)", border: "1.5px solid var(--accent)" }}>
              <span
                className="absolute -top-2.5 right-5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                style={{ background: "var(--accent)", color: "var(--bg)" }}
              >
                Coming
              </span>
              <div className="mb-4">
                <h2 className="text-lg font-black uppercase tracking-wide" style={{ color: "var(--text)" }}>
                  LOOPS Pro
                </h2>
                <div className="flex items-baseline gap-1.5 mt-2">
                  <span className="text-3xl font-black" style={{ color: "var(--text)" }}>€39</span>
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>/ year</span>
                </div>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  Or €4.99/mo. Deliberately under Komoot&apos;s €59.99 — the training intelligence
                  nobody else sells at any price.
                </p>
              </div>
              <ul className="space-y-2.5 flex-1">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    <Check />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div
                className="inline-flex items-center justify-center font-bold text-sm uppercase tracking-wider px-6 py-3 rounded-xl mt-6"
                style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)", cursor: "default" }}
                aria-disabled="true"
              >
                Coming soon
              </div>
            </div>
          </div>
        </section>

        {/* Founding Rider callout */}
        <section className="px-4 md:px-6 py-8">
          <div
            className="max-w-3xl mx-auto rounded-2xl p-6 md:p-8"
            style={{ background: "var(--accent-glow)", border: "1px solid var(--accent)" }}
          >
            <div className="flex flex-col md:flex-row md:items-center gap-5 md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full" style={{ background: "var(--accent)", color: "var(--bg)" }}>
                    Limited founding places
                  </span>
                </div>
                <h2 className="text-xl md:text-2xl font-black tracking-tight mb-2" style={{ color: "var(--text)" }}>
                  Founding Rider — €49 one-off
                </h2>
                <p className="text-sm md:text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Pay once, get LOOPS Pro for life at the founding price, a founding badge, and a
                  direct line to shape the product. No subscription, ever. Founding places are claimed
                  by email for now — send a note and we&apos;ll set you up.
                </p>
              </div>
              <a
                href={foundingMailto}
                className="btn-accent shrink-0 inline-flex items-center justify-center font-bold text-sm uppercase tracking-wider px-6 py-3.5 rounded-xl text-center"
              >
                Claim a Founding spot
              </a>
            </div>
            <p className="text-xs mt-4" style={{ color: "var(--text-secondary)" }}>
              No payment is taken on this page. The button opens an email; we reply with the details.
              No mail app? Write to{" "}
              <span className="font-bold select-all" style={{ color: "var(--text)" }}>{CONTACT_EMAIL}</span>{" "}
              with the subject &ldquo;{FOUNDING_SUBJECT}&rdquo;.
            </p>
          </div>
        </section>

        {/* Reassurance / switch link */}
        <section className="px-4 md:px-6 pb-14">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-sm md:text-base leading-relaxed max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
              Coming from Komoot? Your routes move over free and stay yours.{" "}
              <Link href="/switch" className="font-semibold underline underline-offset-2 py-3" style={{ color: "var(--accent)" }}>
                See how switching works
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

    </div>
  );
}
