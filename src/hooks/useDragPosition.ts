"use client";

import { useCallback, useRef } from "react";

export interface UseDragPositionOptions {
  elementRef: React.RefObject<HTMLElement | null>;
  posX: number;
  posY: number;
  onCommit: (x: number, y: number) => void;
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
 * batches store commits through requestAnimationFrame (one per frame),
 * and commits the final position on release. The hook never touches the store.
 */
export function useDragPosition({
  elementRef,
  posX,
  posY,
  onCommit,
  clamp,
  onDragStart,
  disabled,
}: UseDragPositionOptions): UseDragPositionReturn {
  const dragRef = useRef({ sx: 0, sy: 0, wx: 0, wy: 0 });
  const rafRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
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

      const onUp = () => {
        if (el) el.classList.remove("os-dragging");
        cancelAnimationFrame(rafRef.current);
        onCommit(pendingX, pendingY);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [disabled, posX, posY, clamp, onCommit, onDragStart, elementRef],
  );

  return { handlePointerDown };
}
