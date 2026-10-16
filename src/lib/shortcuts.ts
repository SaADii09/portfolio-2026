export type ShortcutId = "escape" | "palette" | "snap-left" | "snap-right" | "maximize" | "restore";

/**
 * Typing-safety guard: an element is "editable" when the browser would treat
 * keystrokes as text entry — INPUT, TEXTAREA, SELECT, or any contenteditable.
 */
export function isEditableElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  // Fallback for environments where isContentEditable is unavailable (jsdom):
  // `contenteditable` enables editing unless explicitly "false".
  const contentEditable = el.getAttribute("contenteditable");
  return contentEditable !== null && contentEditable !== "false";
}

interface ShortcutEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}

/**
 * Maps a keydown event to a shortcut id.
 *
 * - `Escape` is always claimed (owning surfaces preventDefault first; the
 *   global layer checks `defaultPrevented` on the next tick).
 * - `Mod+K` (Ctrl or Meta, no Alt/Shift) toggles the palette and fires even
 *   while typing.
 * - `Alt+Arrow` combos are suppressed inside editable elements so macOS
 *   Option+arrow word-jump and terminal/chat/notes text entry keep working.
 */
export function matchShortcut(e: ShortcutEvent): ShortcutId | null {
  const key = e.key.toLowerCase();

  if (key === "escape") return "escape";

  if (key === "k" && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
    return "palette";
  }

  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !isEditableElement(e.target)) {
    switch (key) {
      case "arrowleft":
        return "snap-left";
      case "arrowright":
        return "snap-right";
      case "arrowup":
        return "maximize";
      case "arrowdown":
        return "restore";
    }
  }

  return null;
}
