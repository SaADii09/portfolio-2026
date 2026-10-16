export type ShortcutId =
  "escape" | "palette" | "close-window" | "snap-left" | "snap-right" | "maximize" | "restore";

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

/**
 * Ctrl or Meta held, with neither Alt nor Shift.
 *
 * Ctrl+Meta together still counts as one `Mod` (it used to be rejected by an
 * `exactly one modifier` check); every other case is unchanged.
 */
function isModCombo(e: ShortcutEvent): boolean {
  if (e.altKey || e.shiftKey) return false;
  return e.ctrlKey || e.metaKey;
}

/**
 * `Mod+K` toggles the palette; `Mod+W` closes the focused window.
 *
 * Chromium and Firefox reserve Ctrl+W/Cmd+W for closing the tab, so the browser
 * may never deliver the event to the page. The binding is still implemented
 * properly for surfaces that do receive it (installed PWAs, app windows).
 */
const MOD_KEY_SHORTCUTS = new Map<string, ShortcutId>([
  ["k", "palette"],
  ["w", "close-window"],
]);

/** The palette fires even while typing; every other `Mod+X` yields to text entry. */
function yieldsToTyping(id: ShortcutId, target: EventTarget | null): boolean {
  return id !== "palette" && isEditableElement(target);
}

function matchModKey(key: string, e: ShortcutEvent): ShortcutId | null {
  const id = MOD_KEY_SHORTCUTS.get(key);
  if (!id || !isModCombo(e)) return null;
  return yieldsToTyping(id, e.target) ? null : id;
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
  return matchModKey(key, e) ?? matchAltArrow(key, e);
}

/**
 * Maps a keydown event to a shortcut id.
 *
 * - `Escape` is always claimed (owning surfaces preventDefault first; the
 *   global layer checks `defaultPrevented` on the next tick).
 * - `Mod+K` toggles the command palette (fires even while typing).
 * - `Mod+W` closes the focused window (yields to text entry).
 * - `Alt+Arrow` snaps/maximizes/restores the active window.
 */
export function matchShortcut(e: ShortcutEvent): ShortcutId | null {
  const key = e.key.toLowerCase();
  if (key === "escape") return "escape";
  return matchNonEscape(key, e);
}
