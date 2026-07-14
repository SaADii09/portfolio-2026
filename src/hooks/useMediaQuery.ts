"use client";

import { useSyncExternalStore, useRef, useCallback } from "react";

export function useMediaQuery(query: string): boolean {
  const mqlRef = useRef<MediaQueryList | null>(null);

  const getMql = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!mqlRef.current) {
      mqlRef.current = window.matchMedia(query);
    }
    return mqlRef.current;
  }, [query]);

  const subscribe = useCallback(
    (callback: () => void) => {
      const mql = getMql();
      if (!mql) return () => {};
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    [getMql],
  );

  const getSnapshot = useCallback(() => {
    const mql = getMql();
    return mql ? mql.matches : false;
  }, [getMql]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 768px)");
}
