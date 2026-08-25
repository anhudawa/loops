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
              LOOPS helps people discover and plan human-ridden road cycling loops. Some features
              may be offered as a free or invitation-only beta and others may become paid. You must
              use the service lawfully and responsibly, keep your account secure, and not disrupt,
              scrape or misuse the service. We may suspend accounts or remove content that breaches
              these terms or creates a safety, rights or privacy concern.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Closed beta access</h2>
            <p>
              Applying does not guarantee admission. Approved access is personal, may be limited to
              rider or contributor features, and may be paused or removed to protect route quality,
              safety, review capacity or the integrity of the beta. Do not share account access or
              represent a waitlisted application as an invitation.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Contributor promises</h2>
            <p>
              When you submit a loop, you promise that you personally rode the exact submitted
              route, that the uploaded file is your completed-activity recording, and that the ride
              date and source information are accurate. You must own or control the content and have
              permission to let LOOPS use it, including under the terms of the app or device from
              which you exported it. You must not submit another person&apos;s activity, a copied public
              route, synthetic social proof, or a route that exposes another person&apos;s private or
              sensitive location.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Your content and licence</h2>
            <p>
              You keep ownership of content you create. You give LOOPS a non-exclusive, worldwide,
              royalty-free licence to store, verify, analyse, format, reproduce, display, distribute
              and promote submitted route content as part of operating LOOPS, including making an
              approved route available as a downloadable navigation file. This licence allows LOOPS
              to use service providers to operate the product. It does not allow LOOPS to sell your
              personal ride history as a data feed.
            </p>
            <p className="mt-2">
              Submission never guarantees publication. LOOPS may reject, quarantine, mark stale or
              remove a route. You may request removal at hello@loops.ie. We will assess deletion and
              legal-retention requirements and explain the outcome; removal does not undo downloads
              or lawful uses that occurred before the request.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Platform independence</h2>
            <p>
              References to Garmin, RideWithGPS, Komoot, Strava, Wahoo or other services describe a
              contributor&apos;s recording source or a compatible export destination. They do not imply
              sponsorship or endorsement. Direct account integrations remain unavailable unless
              LOOPS has the required platform approval.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Cycling risk and route currency</h2>
            <p>
              Cycling on public roads involves serious risks. Human review and a recent ride record
              do not guarantee that a route is safe for you or that roads, traffic, weather, access
              and surfaces have not changed. Check current conditions, obey the law and road signs,
              use appropriate equipment, and choose a route and workout suitable for your ability.
              Workout suitability describes reviewed route characteristics; it is not coaching,
              medical advice or a direction to perform an effort when conditions are unsafe.
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

          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Last updated: 25 August 2026</p>
        </div>
      </div>
    </div>
  );
}
