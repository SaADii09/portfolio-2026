"use client";

import { useCallback, useEffect, useRef } from "react";

export interface UseDragPositionOptions {
  elementRef: React.RefObject<HTMLElement | null>;
  posX: number;
  posY: number;
  /**
   * Written on every animation frame while dragging, with the raw (clamped)
   * pointer position, and once more on release unless `onRelease` is given.
   */
  onCommit: (x: number, y: number) => void;
  /**
   * Called once with the final pending position when the drag ends
   * (pointerup or pointercancel). Use it for drop-only side effects such as
   * collision resolution; defaults to `onCommit`.
   */
  onRelease?: (x: number, y: number) => void;
  clamp: (x: number, y: number) => { x: number; y: number };
  onDragStart?: () => void;
  disabled?: boolean;
}

interface UseDragPositionReturn {
  handlePointerDown: (e: React.PointerEvent) => void;
}

/**
 * Shared transform-based drag core for windows and widgets.
 * Writes `transform: translate()` on the target element during the drag,
 * batches store commits through requestAnimationFrame (one per frame) with the
 * raw (clamped) position, and hands the final position to `onRelease` when the
 * drag ends. Commits stay raw on purpose: they must match the painted position
 * so React re-renders cannot fight the pointer. The hook never touches the store.
 */
export function useDragPosition({
  elementRef,
  posX,
  posY,
  onCommit,
  onRelease,
  clamp,
  onDragStart,
  disabled,
}: UseDragPositionOptions): UseDragPositionReturn {
  const dragRef = useRef({ sx: 0, sy: 0, wx: 0, wy: 0 });
  const rafRef = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Abort any in-flight drag when the target unmounts, otherwise the document
  // listeners and the pending rAF outlive the element.
  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      cleanupRef.current?.();
      dragRef.current = { sx: e.clientX, sy: e.clientY, wx: posX, wy: posY };
      onDragStart?.();

      const el = elementRef.current;
      if (el) el.classList.add("os-dragging");

      let pendingX = posX;
      let pendingY = posY;
      let rafScheduled = false;

      const onMove = (e: PointerEvent) => {
        const rawX = dragRef.current.wx + e.clientX - dragRef.current.sx;
        const rawY = dragRef.current.wy + e.clientY - dragRef.current.sy;
        const clamped = clamp(rawX, rawY);
        pendingX = clamped.x;
        pendingY = clamped.y;
        if (el) {
          el.style.transform = `translate(${pendingX}px, ${pendingY}px)`;
        }
        if (!rafScheduled) {
          rafScheduled = true;
          rafRef.current = requestAnimationFrame(() => {
            onCommit(pendingX, pendingY);
            rafScheduled = false;
          });
        }
      };

      const cleanup = () => {
        if (el) el.classList.remove("os-dragging");
        cancelAnimationFrame(rafRef.current);
        rafScheduled = false;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);
      };

      const onUp = () => {
        cleanup();
        cleanupRef.current = null;
        (onRelease ?? onCommit)(pendingX, pendingY);
      };

      // A cancelled pointer (browser gesture takeover) ends the drag like a
      // release — same final commit, no leaked listeners.
      const onCancel = () => {
        cleanup();
        cleanupRef.current = null;
        (onRelease ?? onCommit)(pendingX, pendingY);
      };

      cleanupRef.current = cleanup;

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
    },
    [disabled, posX, posY, clamp, onCommit, onRelease, onDragStart, elementRef],
  );

  return { handlePointerDown };
}
