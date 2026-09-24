"use client";

import { usePathname } from "next/navigation";

/** Renders its children except on the given paths (e.g. no site footer on /login). */
export default function HideOnPaths({ paths, children }: { paths: string[]; children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname && paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return <>{children}</>;
}
