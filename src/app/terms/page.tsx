import Link from "next/link";

export const metadata = {
  title: "Terms of Service | LOOPS",
  description: "LOOPS terms of service.",
};

export default function TermsPage() {
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
        <h1 className="text-2xl font-extrabold mb-6" style={{ color: "var(--text)" }}>Terms of Service</h1>

        <div className="space-y-6 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Use of service</h2>
            <p>
              LOOPS is provided free of charge. By using LOOPS you agree to use it responsibly,
              not upload harmful content, and not attempt to disrupt the service. We reserve the
              right to suspend accounts that violate these terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Content</h2>
            <p>
              You retain ownership of routes, photos, and comments you upload. By uploading content
              to LOOPS, you grant us a licence to display it within the service. Other users may
              download route GPX files for personal use.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Disclaimer</h2>
            <p>
              Route information is provided as-is. Always exercise caution when cycling and verify
              conditions before riding. LOOPS is not responsible for the accuracy of user-submitted
              route data or trail conditions.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Contact</h2>
            <p>
              Questions about these terms? Email{" "}
              <a href="mailto:hello@loops.ie" className="font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>
                hello@loops.ie
              </a>.
            </p>
          </section>

          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Last updated: March 2026</p>
        </div>
      </div>
    </div>
  );
}
