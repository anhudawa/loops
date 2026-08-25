import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — LOOPS",
  description:
    "Discover human-ridden Irish road loops reviewed before publication. Search by location, ride time and training session during the LOOPS Ireland beta.",
  alternates: {
    canonical: "https://loops.ie/login",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "LOOPS — Routes Worth Riding",
    description:
      "Human-ridden Irish road loops, reviewed before publication and matched to the ride or training session you want.",
    siteName: "LOOPS",
    type: "website",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "LOOPS — Human-ridden Irish road loops",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LOOPS — Routes Worth Riding",
    description:
      "Human-ridden Irish road loops, reviewed before publication and matched to your session.",
    images: ["/api/og"],
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
