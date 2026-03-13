import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/AuthProvider";
import { ToastProvider } from "@/components/Toast";
import { CapacitorProvider } from "@/components/CapacitorProvider";
import Footer from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://loops.ie"),
  alternates: { canonical: "/" },
  title: "LOOPS — Routes Worth Riding",
  description: "Find and share the best road, gravel, and MTB loops worldwide. Upload GPX files, rate routes, and discover new rides near you. Built by riders, for riders.",
  keywords: ["cycling routes", "gravel cycling", "GPX", "bike routes", "MTB trails", "road cycling", "route sharing", "cycling community"],
  openGraph: {
    title: "LOOPS — Routes Worth Riding",
    description: "Discover and share the best gravel, road & MTB loops worldwide. Built by riders, for riders.",
    siteName: "LOOPS",
    type: "website",
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">
        <ToastProvider>
          <CapacitorProvider>
            <AuthProvider>
              {children}
              <Footer />
            </AuthProvider>
          </CapacitorProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
