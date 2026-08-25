import Link from "next/link";

export const metadata = {
  title: "Contact LOOPS",
  description: "Join the Ireland contributor beta, discuss a future destination partnership, or send product feedback.",
};

export default function FeedbackPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/" className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:opacity-80 transition-opacity" style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <Link href="/">
            <span className="logo-mark text-xl" style={{ color: "var(--text)" }}>LOOPS</span>
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-12">
        <h1 className="text-2xl md:text-3xl font-extrabold mb-3" style={{ color: "var(--text)" }}>Talk to LOOPS</h1>
        <p className="text-sm leading-relaxed mb-8" style={{ color: "var(--text-muted)" }}>
          Choose the path that fits. Ireland is the only active route market; Girona and Mallorca remain gated until local evidence and partners are in place.
        </p>

        <div className="space-y-4 text-sm leading-relaxed">
          <section className="rounded-xl p-5" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--accent)" }}>Ireland · active</p>
            <h2 className="text-lg font-extrabold mb-2" style={{ color: "var(--text)" }}>Become a founding contributor</h2>
            <p className="mb-4" style={{ color: "var(--text-secondary)" }}>
              Experienced Irish road riders can apply to contribute loops they personally rode. Approval comes before file upload and every route receives independent review.
            </p>
            <Link href="/beta" className="btn-accent inline-flex px-4 py-2.5 rounded-lg text-xs font-bold">
              Apply to the Ireland beta
            </Link>
          </section>

          <section id="market-partners" className="rounded-xl p-5 scroll-mt-6" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--accent)" }}>Girona and Mallorca · planned</p>
            <h2 className="text-lg font-extrabold mb-2" style={{ color: "var(--text)" }}>Local rider or operator</h2>
            <p className="mb-4" style={{ color: "var(--text-secondary)" }}>
              We want to hear from local ride leaders, coaches, shops, tour operators and accommodation partners interested in a permissioned pilot after the Ireland gates pass.
            </p>
            <a
              href="mailto:hello@loops.ie?subject=Girona%20or%20Mallorca%20LOOPS%20pilot"
              className="inline-flex px-4 py-2.5 rounded-lg text-xs font-bold"
              style={{ border: "1px solid var(--border)", color: "var(--text)" }}
            >
              Discuss a destination pilot
            </a>
          </section>

          <section className="rounded-xl p-5" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
            <h2 className="text-lg font-extrabold mb-2" style={{ color: "var(--text)" }}>Product feedback</h2>
            <p className="mb-4" style={{ color: "var(--text-secondary)" }}>
              Found a bug, have a feature idea, or saw something that felt wrong? Tell us what happened and where.
            </p>
            <a
              href="mailto:hello@loops.ie?subject=LOOPS%20product%20feedback"
              className="font-bold hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              hello@loops.ie
            </a>
          </section>

          <p className="text-xs px-1" style={{ color: "var(--text-muted)" }}>
            Please do not email ride files, precise home start locations or private activity data. Approved contributors upload evidence through the protected submission workflow.
          </p>
        </div>
      </div>
    </div>
  );
}
