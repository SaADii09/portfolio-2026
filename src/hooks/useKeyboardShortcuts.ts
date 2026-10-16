"use client";

import { useEffect } from "react";
import { useStore } from "@/store";
import { getViewportBounds } from "@/lib/boundaries";
import { MIN_WINDOW_WIDTH } from "@/lib/constants";
import { isEditableElement, matchShortcut } from "@/lib/shortcuts";

/**
 * The single global keyboard layer, mounted once from <Desktop />.
 *
 * Escape ownership convention: transient surfaces (context menus, TopBar
 * dropdowns, the command palette) close themselves in their own keydown
 * listeners and call `preventDefault()`. This layer defers its Escape action
 * to the next tick and stands down when the event was already claimed
 * (`defaultPrevented === true`), so exactly one of the two ever fires.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const shortcut = matchShortcut(e);
      if (!shortcut) return;

      if (shortcut === "escape") {
        // Defer so overlay handlers — which run earlier in the same dispatch
        // and claim Esc via preventDefault — get the first say.
        window.setTimeout(() => {
          if (e.defaultPrevented) return;

          if (isEditableElement(e.target)) {
            (e.target as HTMLElement).blur();
            return;
          }

          const { activeWindowId, closeWindow } = useStore.getState();
          if (activeWindowId) closeWindow(activeWindowId);
        }, 0);
        return;
      }

      // Every remaining shortcut is claimed by the OS layer: preventDefault so
      // the browser never treats Alt+Arrow as history navigation.
      e.preventDefault();

      const store = useStore.getState();

      if (shortcut === "palette") {
        store.togglePalette();
        return;
      }

      const active = store.windows.find((w) => w.id === store.activeWindowId);
      if (!active) return;

      if (shortcut === "maximize") {
        store.maximizeWindow(active.id);
        return;
      }

      if (shortcut === "restore") {
        if (active.isMaximized) store.restoreWindow(active.id);
        return;
      }

      // snap-left / snap-right — ignored while maximized or minimized.
      if (active.isMaximized || active.isMinimized) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const { topBar, bottomBar } = getViewportBounds(vw);
      const width = Math.max(MIN_WINDOW_WIDTH, Math.round(vw / 2));
      store.updateWindowSize(active.id, width, vh - topBar - bottomBar);
      store.updateWindowPosition(active.id, shortcut === "snap-left" ? 0 : vw - width, topBar);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
