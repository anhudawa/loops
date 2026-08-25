import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Find a Human-Ridden Route | LOOPS",
  description:
    "Search the LOOPS library for a human-ridden Irish road route.",
  alternates: { canonical: "/plan" },
  robots: {
    // Interactive planner — nothing for crawlers to index.
    index: false,
    follow: true,
  },
};

export default function PlanPage() {
  redirect("/generate");
}
