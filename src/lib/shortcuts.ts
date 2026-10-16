export type ShortcutId = "escape" | "palette" | "snap-left" | "snap-right" | "maximize" | "restore";

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Typing-safety guard: an element is "editable" when the browser would treat
 * keystrokes as text entry — INPUT, TEXTAREA, SELECT, or any contenteditable.
 */
export function isEditableElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (EDITABLE_TAGS.has(el.tagName)) return true;
  return el.isContentEditable || hasContentEditableAttribute(el);
}

/**
 * Fallback for environments where isContentEditable is unavailable (jsdom):
 * `contenteditable` enables editing unless explicitly "false".
 */
function hasContentEditableAttribute(el: HTMLElement): boolean {
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

/** Alt+Arrow combos, suppressed inside editable elements so macOS Option+arrow
 * word-jump and terminal/chat/notes text entry keep working. */
const ALT_ARROW_SHORTCUTS = new Map<string, ShortcutId>([
  ["arrowleft", "snap-left"],
  ["arrowright", "snap-right"],
  ["arrowup", "maximize"],
  ["arrowdown", "restore"],
]);

function modifierCount(e: ShortcutEvent): number {
  return Number(e.ctrlKey) + Number(e.metaKey) + Number(e.shiftKey) + Number(e.altKey);
}

/** `Mod+K` (Ctrl or Meta, no Alt/Shift) toggles the palette and fires even while typing. */
function isPaletteCombo(e: ShortcutEvent): boolean {
  return modifierCount(e) === 1 && (e.ctrlKey || e.metaKey);
}

/** Alt held alone, with no other modifier. */
function isAltOnly(e: ShortcutEvent): boolean {
  return e.altKey && modifierCount(e) === 1;
}

function matchAltArrow(key: string, e: ShortcutEvent): ShortcutId | null {
  const id = ALT_ARROW_SHORTCUTS.get(key);
  if (!id) return null;
  if (!isAltOnly(e) || isEditableElement(e.target)) return null;
  return id;
}

function matchNonEscape(key: string, e: ShortcutEvent): ShortcutId | null {
  if (key === "k" && isPaletteCombo(e)) return "palette";
  return matchAltArrow(key, e);
}

/**
 * Maps a keydown event to a shortcut id.
 *
 * - `Escape` is always claimed (owning surfaces preventDefault first; the
 *   global layer checks `defaultPrevented` on the next tick).
 * - `Mod+K` toggles the command palette.
 * - `Alt+Arrow` snaps/maximizes/restores the active window.
 */
export function matchShortcut(e: ShortcutEvent): ShortcutId | null {
  const key = e.key.toLowerCase();
  if (key === "escape") return "escape";
  return matchNonEscape(key, e);
}
