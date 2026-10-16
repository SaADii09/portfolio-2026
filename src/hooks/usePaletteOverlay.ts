"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import { optionId } from "@/lib/paletteDom";

/** Autofocus the input on mount; restore focus to whatever was focused before on close. */
function usePaletteAutofocus(inputRef: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previous?.focus?.();
  }, [inputRef]);
}

interface ScrollStyles {
  bodyOverflow: string;
  htmlOverflow: string;
  paddingRight: string;
}

function readScrollStyles(): ScrollStyles {
  return {
    bodyOverflow: document.body.style.overflow,
    htmlOverflow: document.documentElement.style.overflow,
    paddingRight: document.body.style.paddingRight,
  };
}

/**
 * Width of a classic scrollbar, or 0 when there is none (overlay scrollbars,
 * or a zero `clientWidth` as in jsdom / no-layout environments).
 */
function scrollbarWidth(): number {
  const { documentElement } = document;
  if (documentElement.clientWidth <= 0) return 0;
  return window.innerWidth - documentElement.clientWidth;
}

function applyScrollLock(scrollbar: number): void {
  const { body, documentElement } = document;
  body.style.overflow = "hidden";
  documentElement.style.overflow = "hidden";
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
}

function restoreScrollStyles(previous: ScrollStyles): void {
  const { body, documentElement } = document;
  body.style.overflow = previous.bodyOverflow;
  documentElement.style.overflow = previous.htmlOverflow;
  body.style.paddingRight = previous.paddingRight;
}

/**
 * Modal semantics: while the palette owns the screen the document cannot
 * scroll, and the inline styles we touched are restored on close/unmount.
 */
function usePaletteScrollLock(): void {
  useEffect(() => {
    const previous = readScrollStyles();
    applyScrollLock(scrollbarWidth());
    return () => restoreScrollStyles(previous);
  }, []);
}

/**
 * Esc ownership convention: claim the event so the global shortcut layer
 * (deferred, checks `defaultPrevented`) stands down and no window closes.
 */
function useEscapeToClose(close: () => void): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);
}

/** Keep the highlighted row visible while arrowing through the list. */
function useSelectedRowVisible(selectedIndex: number): void {
  useEffect(() => {
    if (selectedIndex < 0) return;
    document.getElementById(optionId(selectedIndex))?.scrollIntoView?.({ block: "nearest" });
  }, [selectedIndex]);
}

export interface PaletteOverlayOptions {
  inputRef: RefObject<HTMLInputElement | null>;
  closePalette(): void;
  selectedIndex: number;
}

/**
 * The palette's modal side effects in one place: initial focus (and its
 * restoration on close), the document scroll lock, Esc ownership, and keeping
 * the highlighted row scrolled into view.
 */
export function usePaletteOverlay({
  inputRef,
  closePalette,
  selectedIndex,
}: PaletteOverlayOptions): void {
  usePaletteAutofocus(inputRef);
  usePaletteScrollLock();
  useEscapeToClose(closePalette);
  useSelectedRowVisible(selectedIndex);
}
