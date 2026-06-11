import type { Metadata } from "next";
import PlanClient from "./PlanClient";

export const metadata: Metadata = {
  title: "Plan a Route | LOOPS",
  description:
    "Draw your ride on the map — tap points and LOOPS snaps a rideable route through them, with live distance and climbing, ready to download as GPX.",
  alternates: { canonical: "/plan" },
  robots: {
    // Interactive planner — nothing for crawlers to index.
    index: false,
    follow: true,
  },
};

export default function PlanPage() {
  return <PlanClient />;
}
