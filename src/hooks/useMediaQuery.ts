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
  // 768px itself is desktop — matches Tailwind's `md:` (min-width: 768px) and
  // `MOBILE_BREAKPOINT` in lib/boundaries.ts (`vw < 768` is mobile). The
  // fractional bound keeps the whole 768px pixel out of the mobile range.
  return useMediaQuery("(max-width: 767.98px)");
}
