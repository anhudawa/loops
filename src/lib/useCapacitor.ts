"use client";

import { useEffect, useState } from "react";

export function useIsNative(): boolean {
  const [native, setNative] = useState(false);

  useEffect(() => {
    import("@capacitor/core").then(({ Capacitor }) => {
      setNative(Capacitor.isNativePlatform());
    });
  }, []);

  return native;
}
