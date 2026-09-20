"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin" | "banned";
  avatar_url?: string | null;
  strava_id?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** True when the auth check failed with a SERVER/network error — i.e. we
   *  could not determine login state. Distinct from a confirmed logged-out
   *  user, so pages can retry instead of ejecting an authenticated rider. */
  authError: boolean;
  unreadCount: number;
  refresh: () => Promise<void>;
  refreshUnread: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  authError: false,
  unreadCount: 0,
  refresh: async () => {},
  refreshUnread: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/unread");
      const data = await res.json();
      setUnreadCount(data.count || 0);
    } catch {
      // ignore
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth");
      // A 5xx or a 429 (rate-limited) is a TRANSIENT failure, not proof the
      // rider is logged out. Flag it and DON'T clear the user, so a signed-in
      // rider is never dumped to the logged-out/paywall app on a blip.
      if (res.status >= 500 || res.status === 429) {
        setAuthError(true);
        return;
      }
      if (res.status === 401) {
        // Genuinely unauthorized.
        setAuthError(false);
        setUser(null);
        return;
      }
      if (!res.ok) {
        // Any other unexpected non-OK — don't confidently log out.
        setAuthError(true);
        return;
      }
      const data = await res.json();
      // A clean 200 with { user: null } is the real logged-out state.
      setAuthError(false);
      setUser(data.user || null);
    } catch {
      // Network error — unknown state, not a confirmed logout.
      setAuthError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth", { method: "DELETE" });
    setUser(null);
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll unread count every 30s when logged in
  useEffect(() => {
    if (!user) return;
    refreshUnread();
    const interval = setInterval(refreshUnread, 30000);
    return () => clearInterval(interval);
  }, [user, refreshUnread]);

  return (
    <AuthContext.Provider value={{ user, loading, authError, unreadCount, refresh, refreshUnread, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
