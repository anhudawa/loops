import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My route submissions | LOOPS",
  robots: { index: false, follow: false, noarchive: true },
};

export default function SubmissionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
