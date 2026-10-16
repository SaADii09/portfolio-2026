"use client";

import { useCallback, useState } from "react";
import { useLongPress } from "@/hooks/useLongPress";

/**
 * Context-menu state plus the long-press handlers that open it, shared by the
 * window and widget headers: a right-click (desktop) and a 500ms long-press
 * (touch) both anchor the same menu at the pointer.
 */
export function useContextMenuLongPress() {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const openContextMenu = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Plain-state open, for callers that must not stop propagation (the desktop
  // headers sit inside the desktop surface's own context-menu handler).
  const openContextMenuAt = useCallback((x: number, y: number) => {
    setContextMenu({ x, y });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const longPress = useLongPress({ onLongPress: openContextMenu });

  return { contextMenu, openContextMenuAt, closeContextMenu, longPress };
}
