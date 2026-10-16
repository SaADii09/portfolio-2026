"use client";

import { useCallback } from "react";

interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
}

/**
 * Merges the long-press handlers with the drag hook's pointerdown so a single
 * header can both arm the touch long-press and start the drag. Move/up simply
 * forward, and no handler is invoked twice.
 */
export function useHeaderDragHandlers(
  longPress: LongPressHandlers,
  handlePointerDown: (e: React.PointerEvent) => void,
) {
  const { onPointerDown, onPointerMove, onPointerUp } = longPress;

  const headerDown = useCallback(
    (e: React.PointerEvent) => {
      onPointerDown(e);
      handlePointerDown(e);
    },
    [onPointerDown, handlePointerDown],
  );

  const headerMove = useCallback(
    (e: React.PointerEvent) => {
      onPointerMove(e);
    },
    [onPointerMove],
  );

  const headerUp = useCallback(() => {
    onPointerUp();
  }, [onPointerUp]);

  return { headerDown, headerMove, headerUp };
}
