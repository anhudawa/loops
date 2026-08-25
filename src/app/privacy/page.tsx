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
              We use essential cookies to keep you signed in and protect login flows. Profile and
              community features may store information you choose to add, messages, favourites,
              comments, photos and condition reports. We do not currently use advertising cookies
              or third-party behavioural analytics. We do not publish your email address, saved
              routes or download history on your public profile.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Ride and route evidence</h2>
            <p>
              A route submission includes the route geometry, elevation, description, claimed ride
              date, recording source, optional private source reference, and evidence metadata such
              as the original file hash, recording window and timestamped point count. LOOPS does
              not publish activity timestamps, heart rate, power, cadence or private source
              references. Approved routes publicly show the route, contributor name, last-ridden
              date and review status. Rejected and in-review submissions are limited to the
              contributor and LOOPS reviewers.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Beta applications</h2>
            <p>
              An Ireland beta application records whether you are applying as a rider or contributor,
              a coarse county or riding area, riding frequency, supported session interests, and any
              club name or notes you choose to provide. Contributor applications also record the
              number of recent loops offered and the apps or devices used to record them. Do not enter
              an address or exact home location. LOOPS administrators use this information and private
              review notes to select balanced beta waves and allocate route coverage. It is not public.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>How we use and share data</h2>
            <p>
              We use data to provide accounts and route planning, verify human-ridden submissions,
              operate safety and incident workflows, secure the service, communicate with you, and
              understand product performance. Public route and profile information is shared with
              people who use LOOPS. Technical service providers may process data for hosting,
              storage, authentication, email and maps under their own contracts. Map providers may
              receive normal network information and the map area viewed. We do not sell personal
              data or provide personal ride histories to data brokers or advertisers.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Ireland beta measurement</h2>
            <p>
              For signed-in beta riders, LOOPS records dated route-level actions such as opening a
              published route, saving it, downloading its GPX, planning it and explicitly confirming
              that the exact route was ridden. These records are tied to the reviewed route version
              so we can measure whether the beta is useful and safe enough to continue. The product
              event records do not contain an IP address, browser or device fingerprint, precise
              search location, activity sensor data or a free-form analytics payload. We do not send
              these events to a third-party behavioural analytics service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Application errors</h2>
            <p>
              When LOOPS encounters a technical failure, it creates a random support reference and
              groups a sanitised error class and one-way code fingerprint for administrators. This
              error queue does not store the raw message or stack trace, request URL or body, IP
              address, user agent, cookie, token, email address or route-search location. Restricted
              hosting logs may retain the safe reference and error class under the hosting provider&apos;s
              security and retention controls.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Location privacy</h2>
            <p>
              Public route geometry can reveal a start or finish location. Contributors must check
              that an upload does not reveal a home or another sensitive place. LOOPS reviewers may
              reject a submission for this reason. We do not silently move points on an approved
              route because that would break its evidence; a changed route needs a new version and
              review.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Retention and your choices</h2>
            <p>
              We keep account, beta-application and contribution records while needed to operate LOOPS, maintain the
              route review and safety audit trail, resolve disputes and meet legal obligations. You
              may ask to access, correct, export, restrict or delete your personal data, object to
              certain uses, or withdraw a route contribution by emailing hello@loops.ie. We will
              verify the request and explain any information we must retain. You may also complain
              to your local data-protection authority.
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

          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Last updated: 25 August 2026</p>
        </div>
      </div>
    </div>
  );
}
