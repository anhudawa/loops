import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import { pageMeta } from "@/lib/site-meta";
import { STRAVA_IMPORT_ENABLED } from "@/config/constants";

const DESCRIPTION = "What LOOPS collects, who processes it, how long we keep it and how to delete your account.";

export const metadata: Metadata = {
  title: "Privacy Policy | LOOPS",
  description: DESCRIPTION,
  ...pageMeta({ path: "/privacy", title: "Privacy Policy | LOOPS", description: DESCRIPTION }),
};

const H2 = { color: "var(--text)" } as const;
const MAIL = (
  <a href="mailto:hello@loops.ie" className="font-bold hover:opacity-80 py-3.5" style={{ color: "var(--accent)" }}>
    hello@loops.ie
  </a>
);

// Who sees what. Keep this list in step with the code: if a new service
// touches rider data, it goes here before it ships. Strava import is behind
// STRAVA_IMPORT_ENABLED (off for v1): listed only while it is switched on.
const ALL_PROCESSORS: { name: string; what: string }[] = [
  { name: "Vercel", what: "Hosts the website and stores uploaded photos. Sees every request, including your IP address." },
  { name: "Vercel Postgres, run by Neon", what: "Our database: your account, saved routes and uploads." },
  { name: "Resend", what: "Sends sign-in links and account emails. Sees your email address." },
  { name: "Anthropic", what: "Reads the text of a route request (\u201c60 km loop from Girona, tailwind home\u201d) to understand it. Only that text, never your name or email." },
  { name: "Strava", what: "Only if you choose to import rides. We store the access tokens Strava gives us so the import works; disconnect any time in Strava." },
  { name: "Open-Meteo", what: "Weather, wind and elevation data. Receives the coordinates of the route being looked at, not who you are." },
  { name: "OpenStreetMap", what: "Map tiles and road data. Your browser loads tiles directly from OpenStreetMap servers, which see your IP address." },
  { name: "Hetzner (Germany)", what: "Hosts our own routing server. Receives route points to calculate a route, nothing about you." },
];
const PROCESSORS = ALL_PROCESSORS.filter((p) => STRAVA_IMPORT_ENABLED || p.name !== "Strava");

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader />

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-12">
        <h1 className="text-2xl font-extrabold mb-2" style={{ color: "var(--text)" }}>Privacy Policy</h1>
        <p className="text-xs mb-8" style={{ color: "var(--text-muted)" }}>Last updated: 23 September 2026</p>

        <div className="space-y-8 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <section>
            <h2 className="text-base font-bold mb-2" style={H2}>Who we are</h2>
            <p>
              LOOPS, operated by Roadman Cycling (Anthony Walsh), Ireland. We are the data
              controller for the personal data described here. Contact: {MAIL}.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={H2}>What we collect</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Your account.</strong> You sign in with Google or with a link we email you.
                With Google we get your name, email address and profile photo. With an email link we
                get your email address.
              </li>
              <li>
                <strong>What you add.</strong> Routes you upload or save, photos, and the text of
                route requests you type or speak.
              </li>
              {STRAVA_IMPORT_ENABLED && (
                <li>
                  <strong>Strava, if you connect it.</strong> The rides you choose to import and the
                  tokens needed to fetch them.
                </li>
              )}
              <li>
                <strong>Cookies.</strong> A session cookie that keeps you signed in, and a
                first-party cookie that remembers where you first came from (for example the
                podcast or a search engine). No third-party analytics or advertising cookies.
              </li>
              <li>
                <strong>Visit counts.</strong> We count visits ourselves, without cookies: the page
                opened, the site that sent you, your device type and the country and city your
                connection comes from. People are counted with a scrambled code that changes every
                month; your IP address is never stored.
              </li>
              <li>
                <strong>Location, if you allow it.</strong> Your browser can share your position so
                the map and route planner start where you are. We don&apos;t keep a location history.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={H2}>What is public</h2>
            <p>
              Routes on LOOPS are public web pages. Anyone with the link can see a route, and search
              engines can index it. If you upload a route, treat it as public. There are no
              messaging or social features at launch.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={H2}>Why we use it</h2>
            <p>
              To run LOOPS for you: sign you in, show and save your routes, build the rides you ask
              for, and email you about your account (legal basis: performing our agreement with you).
              To keep the service secure and working (legitimate interest). The Roadman newsletter
              only if you tick the box for it (consent; unsubscribe from any issue). We don&apos;t
              sell your data and we don&apos;t use it for advertising.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={H2}>Who processes it for us</h2>
            <ul className="space-y-2">
              {PROCESSORS.map((p) => (
                <li key={p.name}>
                  <strong style={{ color: "var(--text)" }}>{p.name}</strong>: {p.what}
                </li>
              ))}
            </ul>
            <p className="mt-3">
              If you opt in to the newsletter, your email address goes to Beehiiv, which sends it.
              Some of these companies are outside the EU; where they are, data moves under the EU
              Standard Contractual Clauses or an equivalent safeguard.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={H2}>How long we keep it</h2>
            <p>
              Your account and routes stay until you delete them or ask us to. Route request text is
              kept with the route it produced. Server logs are kept for a short time by our hosts
              for security and then deleted. When you delete your account we remove your personal
              data within 30 days; backups roll off shortly after.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={H2}>Your rights</h2>
            <p>
              Under GDPR you can ask to see the data we hold on you, correct it, delete it, get a
              copy in a portable format, object to how we use it, or withdraw consent. Email {MAIL}{" "}
              and we&apos;ll reply within a month. If you&apos;re not happy with our answer you can
              complain to the Irish Data Protection Commission (dataprotection.ie).
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={H2}>Deleting your account</h2>
            <p>
              Email {MAIL} from the address you sign in with and say you want your account deleted.
              We&apos;ll delete it, with your routes and photos, and confirm by email.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={H2}>Changes</h2>
            <p>
              If we change this policy we&apos;ll update the date at the top, and tell you by email
              if the change matters.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
