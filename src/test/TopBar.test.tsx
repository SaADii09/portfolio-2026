import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TopBar } from "@/components/os/TopBar";

/**
 * Mobile shade measured-height contract.
 *
 * The shade's resting close value used to be the hardcoded `-400`; a panel
 * measuring taller than 400px left a visible sliver over the status bar. These
 * tests pin the Task-9-style measured-height contract at the two remaining
 * sites: the resting initial state (mount correction) and the backdrop tap.
 *
 * The panel is stubbed to measure 450px — taller than the legacy -400 budget —
 * so every hardcoded `-400` target would fail these assertions.
 */

const mocks = vi.hoisted(() => ({
  state: {
    theme: "retro",
    setTheme: vi.fn(),
    openPalette: vi.fn(),
  },
}));

vi.mock("@/store", () => ({
  useStore: Object.assign((selector: (s: unknown) => unknown) => selector(mocks.state), {
    getState: () => mocks.state,
  }),
}));

vi.mock("@/hooks/useMediaQuery", () => ({
  useIsMobile: () => true,
  useMediaQuery: () => false,
}));

vi.mock("@/hooks/useOsSelectors", () => ({
  useGlassControls: () => ({
    glassOpacity: 0.5,
    glassBlur: 12,
    setGlassOpacity: vi.fn(),
    setGlassBlur: vi.fn(),
  }),
  useGlassBlurControl: () => ({ glassBlur: 12, setGlassBlur: vi.fn() }),
  useMusicPlayback: () => ({
    isPlaying: false,
    currentTrack: { title: "Track", artist: "Artist" },
    togglePlay: vi.fn(),
    nextTrack: vi.fn(),
    prevTrack: vi.fn(),
  }),
  useMusicVolume: () => ({ volume: 0.5, setVolume: vi.fn() }),
}));

const PANEL_HEIGHT = 450;

function stubPanelMeasurement() {
  const zeroRect = { top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0, x: 0, y: 0 };
  return vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
    this: Element,
  ) {
    const rect =
      this.getAttribute("data-testid") === "mobile-shade-panel"
        ? {
            ...zeroRect,
            top: 32,
            bottom: 32 + PANEL_HEIGHT,
            height: PANEL_HEIGHT,
            width: 375,
            right: 375,
          }
        : zeroRect;
    return rect as DOMRect;
  });
}

function getPanel(container: HTMLElement): HTMLElement {
  const panel = container.querySelector('[data-testid="mobile-shade-panel"]');
  expect(panel).not.toBeNull();
  return panel as HTMLElement;
}

function findBackdrop(container: HTMLElement): HTMLElement | undefined {
  return [...container.querySelectorAll("div")].find((el) =>
    (el as HTMLElement).style.background.includes("rgba(0, 0, 0, 0.3)"),
  );
}

describe("TopBar mobile shade (measured-height close)", () => {
  let restore: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    const stub = stubPanelMeasurement();
    restore = () => stub.mockRestore();
  });

  afterEach(() => {
    restore();
  });

  it("rests flush at the measured height instead of the legacy -400 sliver", () => {
    const { container } = render(<TopBar />);
    expect(getPanel(container).style.transform).toBe(`translateY(-${PANEL_HEIGHT}px)`);
  });

  it("backdrop tap closes to the measured height, not -400", () => {
    const { container } = render(<TopBar />);

    // Open via the knob tap (panelOpen false → snapTo(0)).
    fireEvent.click(screen.getByTestId("mobile-shade-knob"));
    expect(getPanel(container).style.transform).toBe("translateY(0px)");

    const backdrop = findBackdrop(container);
    expect(backdrop).toBeDefined();
    fireEvent.click(backdrop as HTMLElement);

    expect(getPanel(container).style.transform).toBe(`translateY(-${PANEL_HEIGHT}px)`);
    // Note: AnimatePresence keeps the backdrop mounted during its 0.2s exit
    // animation (jsdom has no animation frames), so backdrop removal itself is
    // asserted in e2e/mobile.spec.ts. The snap target above is the contract.
  });
});
