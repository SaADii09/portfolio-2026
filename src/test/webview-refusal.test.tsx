import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { WebView, decideRefusal, type FrameSignal } from "@/components/os/WebView";

/**
 * Unit contract for the iframe refusal classifier (Task 10).
 *
 * Calibrated by the temporary spike (deleted before commit; findings live in
 * the constants comment above decideRefusal in WebView.tsx):
 * - every engine fires `load` for X-Frame-Options refusals, and the error page
 *   they commit is invisible to the parent (unreadable document);
 * - a genuinely loaded same-origin frame has an accessible document (WebKit
 *   also fires `load` for the initial about:blank commit — accessible but
 *   blank — so accessibility, not blankness, is the load-or-refuse hinge);
 * - nothing fires for hung frames — that is what the watchdog timeout is for.
 */

const okLoad: FrameSignal = { kind: "load", contentAccessible: true, contentLooksBlank: false };

describe("decideRefusal", () => {
  it("classifies a same-origin embeddable load as ok", () => {
    expect(decideRefusal([okLoad])).toBe("ok");
  });

  it("classes an accessible-but-blank interim load (webkit about:blank commit) as ok", () => {
    expect(
      decideRefusal([{ kind: "load", contentAccessible: true, contentLooksBlank: true }]),
    ).toBe("ok");
  });

  it("classes nothing observed yet as ok (load pending)", () => {
    expect(decideRefusal([])).toBe("ok");
  });

  it("classes the classic error signal as refused", () => {
    expect(decideRefusal([{ kind: "error" }])).toBe("refused");
  });

  it("classes the watchdog timeout signal as refused", () => {
    expect(decideRefusal([{ kind: "timeout" }])).toBe("refused");
  });

  it("classes a load with an unreadable document as refused", () => {
    // Spike: chromium/firefox XFO refusals commit an error page the parent
    // cannot read (contentDocument null or a throwing getter); webkit throws
    // a sandbox access violation on the same read.
    expect(decideRefusal([{ kind: "load", contentAccessible: false }])).toBe("refused");
  });

  it("uses the latest observed signal when a refused frame recovers", () => {
    expect(decideRefusal([{ kind: "timeout" }, okLoad])).toBe("ok");
  });
});

describe("WebView fallback wiring", () => {
  beforeEach(() => {
    // `Date` is faked too: the supersede test below gates its unreadable/readable
    // document stub on the fake clock (relative to the test's own start time).
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function fireLoadThenAdvance(ms: number) {
    const frame = screen.getByTitle("Website preview");
    act(() => {
      fireEvent.load(frame);
    });
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  let contentDocumentDescriptor: PropertyDescriptor;
  function stubUnreadableContentDocument() {
    contentDocumentDescriptor = Object.getOwnPropertyDescriptor(
      HTMLIFrameElement.prototype,
      "contentDocument",
    ) as PropertyDescriptor;
    Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", {
      get() {
        throw new DOMException("denied", "SecurityError");
      },
      configurable: true,
    });
  }

  function restoreContentDocument() {
    Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", contentDocumentDescriptor);
  }

  it("refused load (unreadable document) → fallback panel with screenshot img", () => {
    stubUnreadableContentDocument();
    render(<WebView url="https://github.com/SaADii09" />);

    fireLoadThenAdvance(300);
    restoreContentDocument();

    expect(screen.getByText(/can't be embedded/i)).toBeDefined();
    const shot = document.querySelector<HTMLImageElement>("img[src*='/api/screenshot']");
    expect(shot).not.toBeNull();
    expect(shot?.getAttribute("src")).toBe(
      `/api/screenshot?url=${encodeURIComponent("https://github.com/SaADii09")}`,
    );
  });

  it("watchdog timeout with unreadable document → fallback panel", () => {
    stubUnreadableContentDocument();
    render(<WebView url="https://github.com/SaADii09" />);

    act(() => {
      vi.advanceTimersByTime(3600);
    });
    restoreContentDocument();

    expect(screen.getByText(/can't be embedded/i)).toBeDefined();
    expect(document.querySelector("img[src*='/api/screenshot']")).not.toBeNull();
    expect(screen.queryByTitle("Website preview")).toBeNull();
  });

  it("watchdog timeout with readable, non-blank content → frame stays (webkit missing-load-event)", () => {
    // WebKit can commit an iframe's document without firing the element's load
    // event (observed for a remounted frame). The watchdog must re-probe and
    // keep a frame whose document is actually readable and populated.
    Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", {
      get() {
        const body = { childElementCount: 2 };
        return { body } as unknown as Document;
      },
      configurable: true,
    });
    render(<WebView url="/embeddable-ok" />);

    act(() => {
      vi.advanceTimersByTime(3600);
    });
    restoreContentDocument();

    expect(screen.queryByText(/can't be embedded/i)).toBeNull();
    expect(screen.getByTitle("Website preview")).toBeDefined();
  });

  it("watchdog timeout with accessible-but-blank interim content → frame stays", () => {
    // About:blank at the deadline is an engine mid-commit, not a refusal.
    Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", {
      get() {
        return { body: { childElementCount: 0 } } as unknown as Document;
      },
      configurable: true,
    });
    render(<WebView url="/embeddable-ok" />);

    act(() => {
      vi.advanceTimersByTime(3600);
    });
    restoreContentDocument();

    expect(screen.queryByText(/can't be embedded/i)).toBeNull();
    expect(screen.getByTitle("Website preview")).toBeDefined();
  });

  it("second load supersedes a pending stale probe (webkit two-commit mounts)", () => {
    // WebKit fires two load events per mount: an initial readable-blank
    // about:blank commit, then the real document. The probe scheduled by the
    // first load must be canceled by the second load — a lost timer id would
    // leak past cleanup/unmount, and if the stale probe fires during the
    // load₁→load₂ gap it reads the mid-navigation document and mis-fails the
    // frame (the newer probe's ok path does not reset `failed`).
    //
    // Stub the frame document time-gated on the fake clock: unreadable during
    // the gap window, readable once the second commit has landed. With the
    // supersede fix only the second probe runs (after the gate) → frame stays.
    // Without it the stale probe fires first (before the gate) → fallback.
    const clockStart = Date.now();
    Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", {
      get() {
        if (Date.now() - clockStart < 400) {
          throw new DOMException("unreadable mid-navigation", "SecurityError");
        }
        return { body: { childElementCount: 2 } } as unknown as Document;
      },
      configurable: true,
    });
    render(<WebView url="/embeddable-ok" />);

    const frame = screen.getByTitle("Website preview");
    act(() => {
      fireEvent.load(frame); // commit 1 — probe due at +250ms
    });
    act(() => {
      vi.advanceTimersByTime(200);
      fireEvent.load(frame); // commit 2 — must supersede commit 1's probe
    });
    act(() => {
      vi.advanceTimersByTime(320); // runs only the surviving probe (t=520 > gate)
    });
    restoreContentDocument();

    expect(screen.queryByText(/can't be embedded/i)).toBeNull();
    expect(screen.getByTitle("Website preview")).toBeDefined();
  });

  it("screenshot img onError degrades silently to the external-link-only panel", () => {
    stubUnreadableContentDocument();
    render(<WebView url="https://github.com/SaADii09" />);

    fireLoadThenAdvance(300);
    const shot = document.querySelector<HTMLImageElement>("img[src*='/api/screenshot']");
    expect(shot).not.toBeNull();
    restoreContentDocument();
    act(() => {
      fireEvent(shot as HTMLImageElement, new Event("error"));
    });

    expect(document.querySelector("img[src*='/api/screenshot']")).toBeNull();
    // External escape hatch stays available and never depends on the img.
    expect(screen.getByText(/Open in new tab/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();
  });

  it("retry from the fallback re-arms the iframe and clears the failure", () => {
    render(<WebView url="https://github.com/SaADii09" />);

    act(() => {
      vi.advanceTimersByTime(3600);
    });
    expect(screen.getByText(/can't be embedded/i)).toBeDefined();

    act(() => {
      screen.getByRole("button", { name: /retry/i }).click();
    });

    expect(screen.queryByText(/can't be embedded/i)).toBeNull();
    expect(screen.getByTitle("Website preview")).toBeDefined();
  });
});
