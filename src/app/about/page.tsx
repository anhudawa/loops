import Link from "next/link";

export const metadata = {
  title: "About | LOOPS",
  description: "LOOPS is a free cycling route discovery platform built by riders, for riders.",
};

export default function AboutPage() {
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
        <h1 className="text-2xl font-extrabold mb-6" style={{ color: "var(--text)" }}>About LOOPS</h1>

        <div className="space-y-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <p>
            LOOPS helps road cyclists find enjoyable loops for where they are, how long they have,
            and the kind of ride or training session they want to do. Every published loop is tied
            to a named person who rode that exact route version and is reviewed before publication.
          </p>
          <p>
            The relaunch starts with road cycling in Ireland, followed by Girona and Mallorca after
            the Irish beta meets its trust and usage targets. LOOPS searches and ranks the
            human-ridden library; it does not invent a consumer route when there is no trustworthy match.
          </p>
          <p>
            LOOPS is built and maintained in Ireland. If you have questions or want to get in touch,
            reach out at{" "}
            <a href="mailto:hello@loops.ie" className="font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>
              hello@loops.ie
            </a>.
          </p>
        </div>
      </div>
    </div>
  );
}
