import type { Metadata } from "next";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "LOOPS - Discover Gravel Routes in Ireland",
  description: "Find and share the best gravel cycling loops across Ireland. Upload GPX files, rate routes, and explore gravel rides across every county.",
  openGraph: {
    title: "LOOPS - Discover Gravel Routes in Ireland",
    description: "Find and share the best gravel cycling loops across Ireland",
    siteName: "LOOPS",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LOOPS",
    description: "Discover gravel cycling loops across Ireland",
  },
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
