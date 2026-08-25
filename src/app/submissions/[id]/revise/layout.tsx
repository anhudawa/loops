import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Supply a new ridden version | LOOPS",
  robots: { index: false, follow: false, noarchive: true },
};

export default function RevisionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
