import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

export const LISTBOX_ID = "command-palette-listbox";

export const optionId = (index: number) => `command-palette-option-${index}`;

/** Row id for `aria-activedescendant`, or undefined while nothing is selected. */
export function activeOptionId(index: number): string | undefined {
  if (index < 0) return undefined;
  return optionId(index);
}

/** Everything tabbable inside the dialog, in DOM order (input first, then result rows). */
const FOCUSABLE_SELECTOR = 'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusablesIn(container: HTMLElement | null): HTMLElement[] {
  return Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
}

function currentFocusIndex(list: HTMLElement[]): number {
  return list.indexOf(document.activeElement as HTMLElement);
}

function followingIndex(current: number, count: number): number {
  return (current + 1) % count;
}

function previousIndex(current: number, count: number): number {
  if (current <= 0) return count - 1;
  return current - 1;
}

/** Next focus target, wrapping at both ends; index 0 for 0/1-element lists. */
function nextFocusIndex(list: HTMLElement[], backwards: boolean): number {
  if (list.length <= 1) return 0;
  const current = currentFocusIndex(list);
  return backwards ? previousIndex(current, list.length) : followingIndex(current, list.length);
}

/**
 * Keep Tab inside the dialog (the palette claims `aria-modal`, so focus must
 * not walk into the page behind it). Cycles input → result rows → input; with
 * nothing else focusable, focus stays on the input.
 */
export function trapTab(e: ReactKeyboardEvent, container: HTMLElement | null): void {
  if (e.key !== "Tab") return;
  e.preventDefault();
  const list = focusablesIn(container);
  list[nextFocusIndex(list, e.shiftKey)]?.focus();
}

/** Dismiss the palette when the press lands on the overlay itself, not the dialog. */
export function closeOnBackdrop(e: ReactPointerEvent, close: () => void): void {
  if (e.target === e.currentTarget) close();
}
