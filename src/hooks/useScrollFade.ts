"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** Last painted booleans — attribute writes only on a flip. */
interface FadeState {
  scrollable: boolean;
  atEnd: boolean;
}

/** True when the measured state matches what is already on the element. */
function isSameFade(a: FadeState | null, b: FadeState): boolean {
  return a?.scrollable === b.scrollable && a?.atEnd === b.atEnd;
}

/** Writes the attributes only when a boolean actually flipped. */
function writeFadeState(el: HTMLElement, next: FadeState, last: FadeState | null): FadeState {
  if (last !== null && isSameFade(last, next)) return last;
  el.setAttribute("data-scrollable", String(next.scrollable));
  el.setAttribute("data-scrolled-end", String(next.atEnd));
  return next;
}

/**
 * The scroll affordance (short-window spec G4): announces scroll state on a
 * scrollable element via two data attributes —
 *
 * - `data-scrollable="true|false"` — the content overflows the box;
 * - `data-scrolled-end="true|false"` — the element is scrolled to (or past)
 *   its end (or does not scroll at all).
 *
 * The sticky-bottom fade in globals.css keys on the pair:
 * `[data-scrollable="true"]:not([data-scrolled-end="true"])::after` — an
 * affordance that says "there is more below", gone at the scroll end.
 *
 * Robustness contracts:
 * - Feature-detects `ResizeObserver` (jsdom — and old engines — have none;
 *   degrade to the scroll listener + initial measure, the audio-engine
 *   pattern). Never throws for its absence.
 * - Re-attaches when the element is REPLACED on the same ref: Window.tsx
 *   swaps its mobile/desktop `.os-window-content` branches between renders,
 *   assigning a new element to the same ref object. An identity-checked
 *   state mirror (the callback-ref pattern) tracks the current element.
 * - Measurement is rAF-batched (the useGlassGlare pattern) and only writes
 *   attributes on a boolean flip — never per scroll tick.
 */
export function useScrollFade(ref: RefObject<HTMLElement | null>): void {
  const [element, setElement] = useState<HTMLElement | null>(null);
  // Pending measure coalesced into one frame.
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<FadeState | null>(null);

  // Callback-ref pattern: after every render, mirror ref.current into state.
  // The identity check makes this a no-op unless the element was replaced.
  useEffect(() => {
    if (ref.current !== element) {
      setElement(ref.current);
    }
  });

  useEffect(() => {
    const el = element;
    if (!el || typeof window === "undefined") return;

    const measure = () => {
      rafRef.current = null;
      const scrollable = el.scrollHeight > el.clientHeight;
      const atEnd = !scrollable || el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      lastRef.current = writeFadeState(el, { scrollable, atEnd }, lastRef.current);
    };

    const schedule = () => {
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(measure);
      }
    };

    // Initial measurement — synchronously, so the attributes exist before
    // the first scroll event (and in environments without rAF timers).
    measure();

    el.addEventListener("scroll", schedule, { passive: true });

    // ResizeObserver feature-detect: content-driven size changes (app data
    // loading, theme swaps) re-measure. jsdom has none — the scroll listener
    // and the per-render identity check cover the contract.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver(schedule);
      ro.observe(el);
    }

    return () => {
      el.removeEventListener("scroll", schedule);
      ro?.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastRef.current = null;
    };
  }, [element]);
}
