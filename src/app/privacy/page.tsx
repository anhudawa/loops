import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | LOOPS",
  description: "LOOPS privacy policy — how we handle your data.",
};

export default function PrivacyPage() {
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
        <h1 className="text-2xl font-extrabold mb-6" style={{ color: "var(--text)" }}>Privacy Policy</h1>

        <div className="space-y-6 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>What we collect</h2>
            <p>
              When you sign in with Google, we store your name, email address, and profile photo.
              We use a session cookie to keep you logged in. We do not use third-party analytics
              or tracking cookies.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>How we use your data</h2>
            <p>
              Your data is used solely to provide the LOOPS service: displaying your profile,
              attributing routes and comments you create, and sending you messages from other users.
              We do not sell or share your data with third parties.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Route data</h2>
            <p>
              Routes you upload (GPX coordinates, photos, descriptions) are visible to all
              signed-in users. You can request deletion of your routes by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Contact</h2>
            <p>
              For privacy questions or data deletion requests, email{" "}
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
