import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContextMenu } from "@/components/os/ContextMenu";

// jsdom has no matchMedia; the menu's mobile sizing is covered by e2e.
vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
  useIsMobile: () => false,
}));

const items = [
  { label: "Refresh", onClick: vi.fn() },
  { label: "", separator: true as const, onClick: vi.fn() },
  { label: "About DevOS", onClick: vi.fn() },
  { label: "Terminal", onClick: vi.fn() },
];

function renderMenu(onClose: () => void = vi.fn()) {
  return render(<ContextMenu items={items} position={{ x: 10, y: 10 }} onClose={onClose} />);
}

/**
 * Fixture button focused BEFORE the menu mounts — stands in for the element
 * that opened the menu (desktop surface, icon, widget header, window header).
 * Returns RTL's result plus the trigger for focus assertions.
 */
function renderWithFocusedTrigger(onClose: () => void = vi.fn()) {
  const trigger = document.createElement("button");
  trigger.textContent = "Trigger";
  document.body.appendChild(trigger);
  trigger.focus();
  const result = render(
    <ContextMenu items={items} position={{ x: 10, y: 10 }} onClose={onClose} />,
  );
  return { trigger, ...result };
}

describe("ContextMenu", () => {
  it("renders a role='menu' container with role='menuitem' items (separators excluded)", () => {
    const { container } = renderMenu();

    expect(container.querySelector("[role='menu']")).not.toBeNull();
    const menuitems = screen.getAllByRole("menuitem");
    expect(menuitems).toHaveLength(3);
    expect(menuitems[0]).toHaveTextContent("Refresh");
  });

  it("focuses the first item on open", () => {
    renderMenu();

    const menuitems = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(menuitems[0]);
  });

  it("ArrowDown moves focus to the next item", () => {
    renderMenu();

    fireEvent.keyDown(document, { key: "ArrowDown" });

    const menuitems = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(menuitems[1]);
  });

  it("Home/End jump to first/last and ArrowUp wraps around", () => {
    renderMenu();

    fireEvent.keyDown(document, { key: "End" });
    let menuitems = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(menuitems[2]);

    fireEvent.keyDown(document, { key: "Home" });
    menuitems = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(menuitems[0]);

    fireEvent.keyDown(document, { key: "ArrowUp" });
    menuitems = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(menuitems[2]);
  });

  it("ArrowDown skips separators when moving focus", () => {
    renderMenu();

    // Item order: Refresh, (separator), About DevOS — ArrowDown must land on
    // "About DevOS", never on the separator.
    fireEvent.keyDown(document, { key: "ArrowDown" });

    const menuitems = screen.getAllByRole("menuitem");
    expect(menuitems[1]).toHaveTextContent("About DevOS");
    expect(document.activeElement).toBe(menuitems[1]);
  });

  it("selection (native button activation) fires that item's onClick and closes", () => {
    const onClose = vi.fn();
    renderMenu(onClose);

    fireEvent.keyDown(document, { key: "ArrowDown" });
    const target = screen.getAllByRole("menuitem")[1];
    // Native button behavior: Enter/Space on the focused item produces a click.
    // jsdom does not synthesize that click, so fire it directly — real keyboard
    // actuation is covered in the Playwright suite.
    fireEvent.click(target ?? document.body);

    expect(items[2]?.onClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape closes the menu and claims the event (preventDefault) so the global Esc chain stands down", () => {
    const onClose = vi.fn();
    let escEvent: KeyboardEvent | null = null;
    const peek = (e: KeyboardEvent) => {
      if (e.key === "Escape") escEvent = e;
    };
    document.addEventListener("keydown", peek, true); // make sure we measure the same event

    renderMenu(onClose);
    fireEvent.keyDown(document.body, { key: "Escape" });
    document.removeEventListener("keydown", peek, true);

    expect(onClose).toHaveBeenCalledTimes(1);
    // defaultPrevented is inspected after dispatch completes, so the menu's
    // bubble-phase handler on document has already run.
    expect((escEvent as KeyboardEvent | null)?.defaultPrevented).toBe(true);
  });

  it("restores focus to the previously focused element on unmount (selection / Esc / outside-pointerdown all close via parent unmount)", () => {
    const { trigger, unmount } = renderWithFocusedTrigger();

    expect(document.activeElement).not.toBe(trigger);

    unmount();

    expect(document.activeElement).toBe(trigger);
  });

  it("does not restore focus on unmount when the previous target is gone", () => {
    const { trigger, unmount } = renderWithFocusedTrigger();
    expect(document.activeElement).not.toBe(trigger);

    trigger.remove();
    unmount();

    expect(trigger.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(trigger);
  });

  it("outside pointerdown closes the menu via onClose", () => {
    const onClose = vi.fn();
    renderMenu(onClose);

    fireEvent.pointerDown(document, { bubbles: true });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
