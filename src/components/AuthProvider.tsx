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
      // A 5xx is a SERVER failure, not proof the rider is logged out. Flag it
      // as an auth error and DON'T clear the user, so an authenticated rider
      // isn't ejected to /login on a transient DB/API blip.
      if (res.status >= 500) {
        setAuthError(true);
        return;
      }
      if (!res.ok) {
        // A clean 4xx (e.g. 401) means genuinely logged out.
        setAuthError(false);
        setUser(null);
        return;
      }
      const data = await res.json();
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
