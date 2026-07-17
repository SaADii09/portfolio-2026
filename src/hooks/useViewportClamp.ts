"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/store";
import { MOBILE_BREAKPOINT } from "@/lib/constants";

export function useViewportClamp() {
  const rafRef = useRef(0);
  const prevWidthRef = useRef(0);

  useEffect(() => {
    const clamp = () => {
      const vw = window.innerWidth;
      if (vw === prevWidthRef.current) return;
      prevWidthRef.current = vw;
      const store = useStore.getState();
      store.clampAllWindows();
      store.clampAllWidgets();
      store.resolveAllWidgetCollisions();
    };

    const rafClamp = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(clamp);
    };

    const observer = new ResizeObserver(rafClamp);
    observer.observe(document.body);

    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    mq.addEventListener("change", rafClamp);

    return () => {
      observer.disconnect();
      mq.removeEventListener("change", rafClamp);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);
}
