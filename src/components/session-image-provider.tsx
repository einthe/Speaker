"use client";
import { createContext, useEffect, useState, type ReactNode } from "react";
import { SessionImageCache } from "@/lib/cache/images";

export const SessionImageContext = createContext<SessionImageCache | null>(null);

export function SessionImageProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(() => new SessionImageCache());
  useEffect(() => {
    const clear = () => cache.clear();
    const invalidate = (event: Event) => cache.invalidate((event as CustomEvent<string>).detail);
    window.addEventListener("team:clear-private-cache", clear);
    window.addEventListener("team:invalidate-image", invalidate);
    window.addEventListener("pagehide", clear);
    return () => {
      window.removeEventListener("team:clear-private-cache", clear);
      window.removeEventListener("team:invalidate-image", invalidate);
      window.removeEventListener("pagehide", clear);
      cache.clear();
    };
  }, [cache]);
  return <SessionImageContext.Provider value={cache}>{children}</SessionImageContext.Provider>;
}
