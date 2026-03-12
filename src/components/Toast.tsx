"use client";

import { createContext, useCallback, useContext, useState, useRef, useEffect, ReactNode } from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TOAST_STYLES: Record<ToastType, { bg: string; border: string; color: string; icon: string }> = {
  success: {
    bg: "rgba(0, 255, 136, 0.1)",
    border: "1px solid rgba(0, 255, 136, 0.3)",
    color: "var(--success)",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  error: {
    bg: "rgba(255, 51, 85, 0.1)",
    border: "1px solid rgba(255, 51, 85, 0.3)",
    color: "var(--danger)",
    icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z",
  },
  info: {
    bg: "rgba(200, 255, 0, 0.08)",
    border: "1px solid rgba(200, 255, 0, 0.2)",
    color: "var(--accent)",
    icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
};

function ToastItem({ toast }: { toast: Toast }) {
  const [mounted, setMounted] = useState(false);
  const style = TOAST_STYLES[toast.type];

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  return (
    <div
      role="alert"
      aria-live="polite"
      className="pointer-events-auto px-4 py-3 rounded-xl flex items-center gap-2.5 backdrop-blur-md shadow-lg transition-all duration-300"
      style={{
        background: style.bg,
        border: style.border,
        opacity: mounted && !toast.exiting ? 1 : 0,
        transform: mounted && !toast.exiting ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)",
      }}
    >
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: style.color }}>
        <path strokeLinecap="round" strokeLinejoin="round" d={style.icon} />
      </svg>
      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{toast.message}</p>
    </div>
  );
}
