import Link from "next/link";

export const metadata = {
  title: "Feedback | LOOPS",
  description: "Send feedback about LOOPS.",
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
        <h1 className="text-2xl font-extrabold mb-6" style={{ color: "var(--text)" }}>Feedback</h1>

        <div className="space-y-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <p>
            LOOPS is a work in progress and we genuinely want to hear from you. Whether it&apos;s
            a bug, a feature idea, or just something that felt off — let us know.
          </p>
          <p>
            Send your feedback to{" "}
            <a href="mailto:hello@loops.ie" className="font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>
              hello@loops.ie
            </a>{" "}
            and we&apos;ll get back to you.
          </p>
        </div>
      </div>
    </div>
  );
}
