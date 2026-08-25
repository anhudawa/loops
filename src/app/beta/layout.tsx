import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Apply for the Ireland Road Beta | LOOPS",
  description:
    "Apply to test LOOPS or contribute recent, human-ridden Irish road loops for independent review.",
  alternates: { canonical: "/beta" },
};

export default function BetaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
