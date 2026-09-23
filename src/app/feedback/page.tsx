import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import { pageMeta } from "@/lib/site-meta";

export const metadata: Metadata = {
  title: "Feedback | LOOPS",
  description: "Send feedback about LOOPS.",
  ...pageMeta({ path: "/feedback", title: "Feedback | LOOPS", description: "Send feedback about LOOPS." }),
};

export default function FeedbackPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader />

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-12">
        <h1 className="text-2xl font-extrabold mb-6" style={{ color: "var(--text)" }}>Feedback</h1>

        <div className="space-y-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <p>
            LOOPS is a work in progress and we genuinely want to hear from you. Whether it&apos;s
            a bug, a feature idea, or just something that felt off — let us know.
          </p>
          <p>
            Send your feedback to{" "}
            <a href="mailto:hello@loops.ie" className="font-bold hover:opacity-80 py-3.5" style={{ color: "var(--accent)" }}>
              hello@loops.ie
            </a>{" "}
            and we&apos;ll get back to you.
          </p>
        </div>
      </div>
    </div>
  );
}
