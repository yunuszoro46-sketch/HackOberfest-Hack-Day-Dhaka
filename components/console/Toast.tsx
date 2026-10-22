"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Toast = { text: string; tone: "ok" | "crit"; id: number };
const Ctx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

/** Bottom-right, 1.8s, no stacking: a new toast replaces the current one (design §4.12). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, tone, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 1800);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50">
        {toast && (
          <div key={toast.id} role="status" data-testid="toast"
            className={cn("panel px-3 py-2 font-mono text-[13px]", toast.tone === "ok" ? "border-ok text-ok" : "border-crit text-crit")}>
            {toast.tone === "ok" ? "✓ " : "✕ "}{toast.text}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
