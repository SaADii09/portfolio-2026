"use client";

import { useEffect, useRef } from "react";

/**
 * Delegated mouse-tracking spotlight for all glass elements.
 * Attaches a single mousemove listener on document.body and updates
 * --mouse-x / --mouse-y CSS custom properties on the nearest glass ancestor.
 * Desktop-only (>=1024px), RAF-batched for 60fps.
 */
export function useGlassGlare() {
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number; target: HTMLElement } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isDesktop = () => window.innerWidth >= 1024;

    const flush = () => {
      rafRef.current = null;
      const pending = pendingRef.current;
      if (!pending) return;

      const el = (pending.target.closest(
        ".glass, .glass-heavy, .glass-light"
      ) as HTMLElement | null);
      if (el) {
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--mouse-x", `${pending.x - rect.left}px`);
        el.style.setProperty("--mouse-y", `${pending.y - rect.top}px`);
      }
      pendingRef.current = null;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDesktop()) return;

      // Find glass ancestor from event target
      const target = e.target as HTMLElement;
      const glassEl = target.closest(".glass, .glass-heavy, .glass-light") as HTMLElement | null;
      if (!glassEl) return;

      pendingRef.current = { x: e.clientX, y: e.clientY, target: glassEl };

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    };

    document.addEventListener("mousemove", handleMouseMove, { passive: true });

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);
}
