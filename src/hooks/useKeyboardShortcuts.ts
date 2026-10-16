"use client";

import { useEffect } from "react";
import { useStore } from "@/store";
import { getViewportBounds } from "@/lib/boundaries";
import { MIN_WINDOW_WIDTH } from "@/lib/constants";
import { isEditableElement, matchShortcut, type ShortcutId } from "@/lib/shortcuts";

type StoreState = ReturnType<typeof useStore.getState>;
type WindowState = StoreState["windows"][number];

function findActiveWindow(store: StoreState): WindowState | undefined {
  return store.windows.find((w) => w.id === store.activeWindowId);
}

/**
 * Escape ownership convention: transient surfaces (context menus, TopBar
 * dropdowns, the command palette) close themselves in their own keydown
 * listeners and call `preventDefault()`. This layer defers its Escape action
 * to the next tick and stands down when the event was already claimed
 * (`defaultPrevented === true`), so exactly one of the two ever fires.
 */
function scheduleEscape(e: KeyboardEvent): void {
  window.setTimeout(() => {
    if (e.defaultPrevented) return;
    dismissOnEscape(e.target);
  }, 0);
}

/** Blur an editor, or close the active window when the keystroke was a plain Esc. */
function dismissOnEscape(target: EventTarget | null): void {
  if (isEditableElement(target)) {
    (target as HTMLElement).blur();
    return;
  }

  const { activeWindowId, closeWindow } = useStore.getState();
  if (activeWindowId) closeWindow(activeWindowId);
}

function snapX(side: "left" | "right", vw: number, width: number): number {
  return side === "left" ? 0 : vw - width;
}

/** snap-left / snap-right — ignored while maximized or minimized. */
function snapWindow(store: StoreState, active: WindowState, side: "left" | "right"): void {
  if (active.isMaximized || active.isMinimized) return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { topBar, bottomBar } = getViewportBounds(vw);
  const width = Math.max(MIN_WINDOW_WIDTH, Math.round(vw / 2));
  store.updateWindowSize(active.id, width, vh - topBar - bottomBar);
  store.updateWindowPosition(active.id, snapX(side, vw, width), topBar);
}

type WindowShortcutHandler = (store: StoreState, active: WindowState) => void;

const WINDOW_SHORTCUT_HANDLERS: Partial<Record<ShortcutId, WindowShortcutHandler>> = {
  // Mirrors dismissOnEscape: close the active window, no-op when none is focused.
  "close-window": (store, active) => store.closeWindow(active.id),
  maximize: (store, active) => store.maximizeWindow(active.id),
  restore: (store, active) => {
    if (active.isMaximized) store.restoreWindow(active.id);
  },
  "snap-left": (store, active) => snapWindow(store, active, "left"),
  "snap-right": (store, active) => snapWindow(store, active, "right"),
};

function applyWindowShortcut(shortcut: ShortcutId, store: StoreState, active: WindowState): void {
  const handler = WINDOW_SHORTCUT_HANDLERS[shortcut];
  if (handler) handler(store, active);
}

/** Claim a window shortcut for the OS layer — the palette needs no active window. */
function applyShortcut(shortcut: ShortcutId): void {
  const store = useStore.getState();

  if (shortcut === "palette") {
    store.togglePalette();
    return;
  }

  const active = findActiveWindow(store);
  if (active) applyWindowShortcut(shortcut, store, active);
}

/**
 * The single global keyboard layer, mounted once from <Desktop />.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const shortcut = matchShortcut(e);
      if (!shortcut) return;

      if (shortcut === "escape") {
        scheduleEscape(e);
        return;
      }

      // Every remaining shortcut is claimed by the OS layer: preventDefault so
      // the browser never treats Alt+Arrow as history navigation.
      e.preventDefault();
      applyShortcut(shortcut);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
