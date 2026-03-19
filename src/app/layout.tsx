import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { ToastProvider } from "@/components/Toast";
import { CapacitorProvider } from "@/components/CapacitorProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import Footer from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import { generateOrganizationJsonLd, generateWebSiteJsonLd } from "@/lib/seo";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.loops.ie"),
  alternates: { canonical: "/" },
  title: "LOOPS — Cycling Routes Worldwide | Free GPX Downloads",
  description: "Discover cycling routes worldwide. Free GPX downloads, community ratings, elevation profiles. Gravel, road & MTB routes from real riders.",
  keywords: ["cycling routes", "gravel cycling", "GPX", "bike routes", "MTB trails", "road cycling", "route sharing", "cycling community"],
  verification: {
    google: "0-mGmMRQK6Iu8na6wuEcwzm1I7RO2uT3-XJ3T8C5wys",
  },
  openGraph: {
    title: "LOOPS — Routes Worth Riding",
    description: "Discover and share the best gravel, road & MTB loops worldwide. Built by riders, for riders.",
    siteName: "LOOPS",
    type: "website",
    locale: "en_IE",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "LOOPS — Discover cycling routes worldwide" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LOOPS — Routes Worth Riding",
    description: "Discover and share the best gravel, road & MTB loops worldwide. Built by riders, for riders.",
    images: ["/api/og"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className="antialiased">
        <JsonLd data={generateWebSiteJsonLd()} />
        <JsonLd data={generateOrganizationJsonLd()} />
        <ErrorBoundary>
          <ToastProvider>
            <CapacitorProvider>
              <AuthProvider>
                {children}
                <Footer />
              </AuthProvider>
            </CapacitorProvider>
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
