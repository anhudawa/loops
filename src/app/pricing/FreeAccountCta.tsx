"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

const CLASS =
  "inline-flex items-center justify-center font-bold text-sm uppercase tracking-wider px-6 py-3 min-h-[44px] rounded-xl mt-6";
const STYLE = { border: "1px solid var(--border)", color: "var(--text)" } as const;

/**
 * The Free card's button. New riders get the sign-up page (with the
 * newsletter opt-in) and come back here; signed-in riders already have the
 * account, so they get the planner instead. Nothing is shown until the
 * sign-in check answers, so a signed-in rider never sees "Create an account"
 * (if the check fails, the login page itself says "You're logged in").
 */
export default function FreeAccountCta() {
  const { user, loading } = useAuth();
  if (loading) return <span className={CLASS} style={{ visibility: "hidden" }} aria-hidden="true">&nbsp;</span>;
  if (user) {
    return (
      <Link href="/generate" className={CLASS} style={STYLE}>
        Plan a ride
      </Link>
    );
  }
  return (
    <Link href={`/login?mode=signup&redirect=${encodeURIComponent("/pricing")}`} className={CLASS} style={STYLE}>
      Create a free account
    </Link>
  );
}
