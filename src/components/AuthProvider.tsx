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
  unreadCount: number;
  refresh: () => Promise<void>;
  refreshUnread: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  unreadCount: 0,
  refresh: async () => {},
  refreshUnread: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
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
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data.user || null);
    } catch {
      setUser(null);
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
    <AuthContext.Provider value={{ user, loading, unreadCount, refresh, refreshUnread, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
