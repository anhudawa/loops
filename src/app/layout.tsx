import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/AuthProvider";
import { ToastProvider } from "@/components/Toast";
import { CapacitorProvider } from "@/components/CapacitorProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "LOOPS - Discover Cycling Routes",
  description: "Find and share the best road, gravel, and MTB loops. Upload GPX files, rate routes, and explore rides worldwide.",
  openGraph: {
    title: "LOOPS - Discover Cycling Routes",
    description: "Find and share the best road, gravel, and MTB loops worldwide",
    siteName: "LOOPS",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LOOPS",
    description: "Discover cycling loops worldwide — road, gravel, and MTB",
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
            <AuthProvider>{children}</AuthProvider>
          </CapacitorProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
