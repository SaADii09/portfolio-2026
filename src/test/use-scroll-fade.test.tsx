import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, act, cleanup } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { useScrollFade } from "@/hooks/useScrollFade";
import { Window } from "@/components/os/Window";

/**
 * The scroll affordance contract (short-window spec G4): every real scroller
 * announces `data-scrollable` / `data-scrolled-end` so the sticky-bottom fade
 * in globals.css can say "there is more below" — and get out of the way at
 * the scroll end.
 *
 * jsdom notes: scrollHeight/clientHeight/scrollTop all report 0, so every
 * geometry pin stubs them with Object.defineProperty. ResizeObserver does
 * not exist in jsdom (the hook must feature-detect, audio-engine pattern)
 * and requestAnimationFrame runs on a real ~16ms clock (tests flush it with
 * a short sleep).
 */

vi.mock("@/hooks/useMediaQuery", () => ({
  useIsMobile: () => false,
}));

const baseWindow = {
  id: "win-1",
  title: "Test App",
  type: "app" as const,
  component: "AboutApp",
  x: 100,
  y: 100,
  width: 400,
  height: 300,
  zIndex: 101,
  opacity: 1,
  isMinimized: false,
  isMaximized: false,
  isPinned: false,
};

vi.mock("@/store", () => ({
  useStore: (selector: (s: unknown) => unknown) => {
    const state = {
      windows: [baseWindow],
      activeWindowId: "win-1",
      focusWindow: vi.fn(),
      closeWindow: vi.fn(),
      minimizeWindow: vi.fn(),
      maximizeWindow: vi.fn(),
      restoreWindow: vi.fn(),
      setWindowOpacity: vi.fn(),
      updateWindowPosition: vi.fn(),
      updateWindowSize: vi.fn(),
    };
    return selector(state);
  },
}));

/** Stub a jsdom element's scroll geometry (all read 0 by default). */
function stubScrollGeometry(
  el: HTMLElement,
  geo: { scrollHeight: number; clientHeight: number; scrollTop?: number },
) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: geo.scrollHeight });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: geo.clientHeight });
  Object.defineProperty(el, "scrollTop", { configurable: true, value: geo.scrollTop ?? 0 });
}

/** jsdom rAF fires on a ~16ms timer — a 30ms sleep reliably flushes one frame. */
async function flushRaf() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

afterEach(() => {
  cleanup();
});

describe("useScrollFade", () => {
  function Harness({
    geo,
    swapKey = 0,
    children,
  }: {
    geo: { scrollHeight: number; clientHeight: number; scrollTop?: number };
    swapKey?: number;
    children?: ReactNode;
  }) {
    const ref = useRef<HTMLDivElement | null>(null);
    useScrollFade(ref);
    // swapKey simulates Window.tsx's mobile/desktop branch swap: a NEW element
    // is assigned to the SAME ref object between renders. The callback ref
    // stubs the geometry at attach time — BEFORE the hook's effects measure.
    return (
      <div
        key={swapKey}
        ref={(el) => {
          ref.current = el;
          if (el) stubScrollGeometry(el, geo);
        }}
        data-testid="scroller"
      >
        {children}
      </div>
    );
  }

  it("marks a scrollable element data-scrollable=true", async () => {
    render(
      <Harness geo={{ scrollHeight: 500, clientHeight: 300 }}>
        <p>content</p>
      </Harness>,
    );
    const el = screen.getByTestId("scroller");
    await flushRaf();
    expect(el.getAttribute("data-scrollable")).toBe("true");
    expect(el.getAttribute("data-scrolled-end")).toBe("false");
  });

  it("marks a fitting element data-scrollable=false", async () => {
    render(
      <Harness geo={{ scrollHeight: 200, clientHeight: 300 }}>
        <p>content</p>
      </Harness>,
    );
    const el = screen.getByTestId("scroller");
    await flushRaf();
    expect(el.getAttribute("data-scrollable")).toBe("false");
  });

  it("flips data-scrolled-end at the scroll end", async () => {
    const geo = { scrollHeight: 500, clientHeight: 300, scrollTop: 0 };
    render(
      <Harness geo={geo}>
        <p>content</p>
      </Harness>,
    );
    const el = screen.getByTestId("scroller");
    await flushRaf();
    expect(el.getAttribute("data-scrolled-end")).toBe("false");

    // Scroll to the end: 200 + 300 ≥ 500.
    stubScrollGeometry(el, { ...geo, scrollTop: 200 });
    await act(async () => {
      el.dispatchEvent(new Event("scroll"));
    });
    await flushRaf();
    expect(el.getAttribute("data-scrolled-end")).toBe("true");

    // Scroll back up: the affordance returns.
    stubScrollGeometry(el, { ...geo, scrollTop: 0 });
    await act(async () => {
      el.dispatchEvent(new Event("scroll"));
    });
    await flushRaf();
    expect(el.getAttribute("data-scrolled-end")).toBe("false");
  });

  it("does not throw and still measures without ResizeObserver (jsdom reality)", async () => {
    // jsdom has no ResizeObserver — the feature-detect must degrade to the
    // scroll listener + initial measure, never throw (audio-engine pattern).
    expect(typeof ResizeObserver).toBe("undefined");
    render(
      <Harness geo={{ scrollHeight: 500, clientHeight: 300 }}>
        <p>content</p>
      </Harness>,
    );
    const el = screen.getByTestId("scroller");
    await flushRaf();
    expect(el.getAttribute("data-scrollable")).toBe("true");
  });

  it("re-attaches when the element is replaced on the same ref (branch swap)", async () => {
    const geo = { scrollHeight: 500, clientHeight: 300 };
    const { rerender } = render(<Harness geo={geo} swapKey={0} />);
    await flushRaf();
    expect(screen.getByTestId("scroller").getAttribute("data-scrollable")).toBe("true");

    // New element on the same ref object — the hook must re-attach and
    // re-measure it (Window.tsx swaps .os-window-content branches here).
    rerender(<Harness geo={geo} swapKey={1} />);
    await flushRaf();
    expect(screen.getByTestId("scroller").getAttribute("data-scrollable")).toBe("true");
  });
});

describe("Window — the content scroller carries the fade attributes", () => {
  it("both data attributes are present on .os-window-content", async () => {
    render(
      <Window id="win-1">
        <p>hello world</p>
      </Window>,
    );
    const content = document.querySelector(".os-window-content") as HTMLElement;
    expect(content).not.toBeNull();
    await flushRaf();
    // jsdom reports 0×0 geometry → not scrollable; the ATTRIBUTES are the
    // contract (the e2e suite owns the visual truth with real layout).
    expect(content.getAttribute("data-scrollable")).toBe("false");
    expect(content.getAttribute("data-scrolled-end")).toBe("true");
  });
});

describe("globals.css — the source-CSS fade contract", () => {
  // Unit tests can only see SOURCE css; the BUILT-css assertions (the rule
  // surviving the Tailwind/lightningcss pipeline) live in the e2e
  // css-integrity spec (Wave 2).
  const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf-8");

  it("keys the sticky-bottom fade on the hook's attribute pair", () => {
    expect(css).toContain('[data-scrollable="true"]:not([data-scrolled-end="true"])::after');
    expect(css).toMatch(/position:\s*sticky/);
    expect(css).toMatch(/pointer-events:\s*none/);
  });

  it("colors the fade via the token idiom — no hardcoded palette values", () => {
    const start = css.indexOf('[data-scrollable="true"]');
    const end = css.indexOf("}", start);
    const rule = css.slice(start, end);
    expect(rule).toContain("color-mix(in srgb, var(--bg-primary)");
    expect(rule).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
