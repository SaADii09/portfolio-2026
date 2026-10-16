import { describe, it, expect } from "vitest";
import { isEditableElement, matchShortcut, ShortcutId } from "@/lib/shortcuts";

type Mods = {
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

function keydown(key: string, mods: Mods = {}, target: EventTarget | null = document.body) {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
    target,
  };
}

function contentEditableDiv(): HTMLElement {
  const el = document.createElement("div");
  // jsdom 26 does not implement the contentEditable IDL reflection, so set the
  // attribute the same way HTML would; browsers also report isContentEditable.
  el.setAttribute("contenteditable", "true");
  return el;
}

describe("matchShortcut", () => {
  const cases: Array<[string, ReturnType<typeof keydown>, ShortcutId | null]> = [
    ["Escape with no modifiers", keydown("Escape"), "escape"],
    [
      "Escape is always claimed, even with modifiers held",
      keydown("Escape", { ctrlKey: true, shiftKey: true }),
      "escape",
    ],
    ["Ctrl+K opens the palette", keydown("k", { ctrlKey: true }), "palette"],
    ["Meta+K opens the palette", keydown("K", { metaKey: true }), "palette"],
    [
      "Ctrl+K fires even while an input is focused",
      keydown("k", { ctrlKey: true }, document.createElement("input")),
      "palette",
    ],
    ["Ctrl+Shift+K is not a shortcut", keydown("k", { ctrlKey: true, shiftKey: true }), null],
    ["Ctrl+Alt+K is not a shortcut", keydown("k", { ctrlKey: true, altKey: true }), null],
    [
      "Ctrl+Meta+K still opens the palette (both modifiers held)",
      keydown("k", { ctrlKey: true, metaKey: true }),
      "palette",
    ],
    ["plain K is not a shortcut", keydown("k"), null],
    ["Ctrl+W closes the focused window", keydown("w", { ctrlKey: true }), "close-window"],
    ["Meta+W closes the focused window", keydown("W", { metaKey: true }), "close-window"],
    [
      "Ctrl+Meta+W closes the focused window (both modifiers held)",
      keydown("w", { ctrlKey: true, metaKey: true }),
      "close-window",
    ],
    ["Ctrl+Shift+W is not a shortcut", keydown("w", { ctrlKey: true, shiftKey: true }), null],
    ["Ctrl+Alt+W is not a shortcut", keydown("w", { ctrlKey: true, altKey: true }), null],
    ["Alt+W is not a shortcut", keydown("w", { altKey: true }), null],
    ["plain W is not a shortcut", keydown("w"), null],
    ["Alt+ArrowLeft snaps left", keydown("ArrowLeft", { altKey: true }), "snap-left"],
    ["Alt+ArrowRight snaps right", keydown("ArrowRight", { altKey: true }), "snap-right"],
    ["Alt+ArrowUp maximizes", keydown("ArrowUp", { altKey: true }), "maximize"],
    ["Alt+ArrowDown restores", keydown("ArrowDown", { altKey: true }), "restore"],
    [
      "Shift+Alt+ArrowLeft is not a shortcut",
      keydown("ArrowLeft", { altKey: true, shiftKey: true }),
      null,
    ],
    [
      "Ctrl+Alt+ArrowLeft is not a shortcut",
      keydown("ArrowLeft", { altKey: true, ctrlKey: true }),
      null,
    ],
    [
      "Meta+Alt+ArrowLeft is not a shortcut",
      keydown("ArrowLeft", { altKey: true, metaKey: true }),
      null,
    ],
    ["plain ArrowLeft is not a shortcut", keydown("ArrowLeft"), null],
    ["Alt+A is not a shortcut", keydown("a", { altKey: true }), null],
    ["unrelated keys are not shortcuts", keydown("F5"), null],
  ];

  for (const [name, event, expected] of cases) {
    it(name, () => {
      expect(matchShortcut(event)).toBe(expected);
    });
  }

  it("suppresses Alt+arrows while typing in an input", () => {
    expect(
      matchShortcut(keydown("ArrowLeft", { altKey: true }, document.createElement("input"))),
    ).toBeNull();
  });

  it("suppresses Alt+arrows while typing in a textarea", () => {
    expect(
      matchShortcut(keydown("ArrowRight", { altKey: true }, document.createElement("textarea"))),
    ).toBeNull();
  });

  it("suppresses Alt+arrows while a select has focus", () => {
    expect(
      matchShortcut(keydown("ArrowUp", { altKey: true }, document.createElement("select"))),
    ).toBeNull();
  });

  it("suppresses Alt+arrows inside a contenteditable", () => {
    expect(matchShortcut(keydown("ArrowDown", { altKey: true }, contentEditableDiv()))).toBeNull();
  });

  it("suppresses Ctrl+W while typing in an input", () => {
    expect(
      matchShortcut(keydown("w", { ctrlKey: true }, document.createElement("input"))),
    ).toBeNull();
  });

  it("suppresses Ctrl+W while typing in a textarea", () => {
    expect(
      matchShortcut(keydown("w", { ctrlKey: true }, document.createElement("textarea"))),
    ).toBeNull();
  });

  it("suppresses Cmd+W inside a contenteditable", () => {
    expect(matchShortcut(keydown("w", { metaKey: true }, contentEditableDiv()))).toBeNull();
  });
});

describe("isEditableElement", () => {
  it("returns true for input, textarea, and select", () => {
    expect(isEditableElement(document.createElement("input"))).toBe(true);
    expect(isEditableElement(document.createElement("textarea"))).toBe(true);
    expect(isEditableElement(document.createElement("select"))).toBe(true);
  });

  it("returns true for a contenteditable div", () => {
    expect(isEditableElement(contentEditableDiv())).toBe(true);
  });

  it("returns false for a plain div", () => {
    expect(isEditableElement(document.createElement("div"))).toBe(false);
  });

  it("returns false for document.body", () => {
    expect(isEditableElement(document.body)).toBe(false);
  });

  it("returns false for null and non-element targets", () => {
    expect(isEditableElement(null)).toBe(false);
    expect(isEditableElement(new EventTarget())).toBe(false);
  });
});
