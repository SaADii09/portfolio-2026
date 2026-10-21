import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { WebView, decideRefusal, type FrameSignal } from "@/components/os/WebView";

/**
 * Unit contract for the iframe refusal classifier (Task 10) + the Task A2
 * verdict-flow rework.
 *
 * Calibrated by the temporary spike (deleted before commit; findings live in
 * the constants comment above decideRefusal in WebView.tsx):
 * - every engine fires `load` for X-Frame-Options refusals, and the error page
 *   they commit is invisible to the parent (unreadable document);
 * - a genuinely loaded same-origin frame has an accessible document (WebKit
 *   also fires `load` for the initial about:blank commit — accessible but
 *   blank — so accessibility, not blankness, is the load-or-refuse hinge);
 * - nothing fires for hung frames — that is what the watchdog timeout is for.
 *
 * A2 rework: an unreadable document is NO LONGER a refusal by itself — every
 * cross-origin frame is unreadable (Same-Origin Policy), refusals and working
 * sites alike. Unreadable now consults `/api/embed-check`'s server verdict:
 * the iframe stays MOUNTED through the verdict flight and only a blocked
 * verdict swaps to the fallback panel (Review Focus 1).
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
    // a sandbox access violation on the same read. The label survives A2 —
    // WebView now treats it as "consult the server verdict", not "fail".
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
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  /** Overwrites the jsdom contentDocument getter; returns its real descriptor restorer. */
  function overrideContentDocument(getter: () => unknown): () => void {
    const previous = Object.getOwnPropertyDescriptor(
      HTMLIFrameElement.prototype,
      "contentDocument",
    );
    Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", {
      get: getter,
      configurable: true,
    });
    return () => {
      if (previous !== undefined) {
        Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", previous);
      }
    };
  }

  const OVERRIDE_UNREADABLE = (): (() => void) =>
    overrideContentDocument(() => {
      throw new DOMException("denied", "SecurityError");
    });

  // --- the server verdict (/api/embed-check) --------------------------------

  const fetchMock = vi.fn();

  /** 200 verdict stub; assert no /api/embed-check call ran with the mock itself. */
  function mockEmbedCheck(answer: unknown, status = 200) {
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => answer,
    });
    vi.stubGlobal("fetch", fetchMock);
  }

  /** Flushes the verdict promise chain scheduled by the probe. */
  async function settle() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  const GITHUB = "https://github.com/SaADii09";

  /**
   * A pending-promise verdict: the request is in flight and honours the probe's
   * abort signal (like the real fetch would).
   */
  function mockPendingVerdict() {
    let resolve!: (response: unknown) => void;
    fetchMock.mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return () =>
      resolve({ ok: true, status: 200, json: async () => ({ embeddable: true, reason: "ok" }) });
  }

  function verdictSignal(): AbortSignal {
    return (fetchMock.mock.calls[0]?.[1] as { signal: AbortSignal }).signal;
  }

  // --- same-origin pins (kept green UNMOCKED — the readable frame never
  // --- consults the server; a stray verdict request would fail loudly below) -

  it("watchdog timeout with readable, non-blank content → frame stays (webkit missing-load-event)", () => {
    // WebKit can commit an iframe's document without firing the element's load
    // event (observed for a remounted frame). The watchdog must re-probe and
    // keep a frame whose document is actually readable and populated.
    const restoreDocument = overrideContentDocument(() => {
      const body = { childElementCount: 2 };
      return { body } as unknown as Document;
    });
    render(<WebView url="/embeddable-ok" />);

    act(() => {
      vi.advanceTimersByTime(3600);
    });
    restoreDocument();

    expect(screen.queryByText(/blocks embedding/i)).toBeNull();
    expect(screen.getByTitle("Website preview")).toBeDefined();
  });

  it("watchdog timeout with accessible-but-blank interim content → frame stays", () => {
    // About:blank at the deadline is an engine mid-commit, not a refusal.
    const restoreDocument = overrideContentDocument(() => {
      return { body: { childElementCount: 0 } } as unknown as Document;
    });
    render(<WebView url="/embeddable-ok" />);

    act(() => {
      vi.advanceTimersByTime(3600);
    });
    restoreDocument();

    expect(screen.queryByText(/blocks embedding/i)).toBeNull();
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
    const restoreDocument = overrideContentDocument(() => {
      if (Date.now() - clockStart < 400) {
        throw new DOMException("unreadable mid-navigation", "SecurityError");
      }
      return { body: { childElementCount: 2 } } as unknown as Document;
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
    restoreDocument();

    expect(screen.queryByText(/blocks embedding/i)).toBeNull();
    expect(screen.getByTitle("Website preview")).toBeDefined();
  });

  // --- the verdict flow (A2): the iframe survives the verdict ---------------

  it("same-origin unreadable frame is a LOCAL refusal — no server round trip", () => {
    // A same-origin document is always readable unless the browser refused to
    // load it (XFO binds same-origin framing too). Local dev serves the
    // /embed-refusal fixture over http://localhost, which the https-only
    // embed-check route must reject — so the client owns this case itself,
    // otherwise the frame would stay blank forever.
    const restoreDocument = OVERRIDE_UNREADABLE();
    render(<WebView url="http://localhost:3000/embed-refusal" />);

    fireLoadThenAdvance(300);
    restoreDocument();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/blocks embedding/i)).toBeDefined();
    expect(screen.queryByTitle("Website preview")).toBeNull();
  });

  it("unreadable load with a BLOCKED verdict → fallback panel with screenshot img", async () => {
    const restoreDocument = OVERRIDE_UNREADABLE();
    mockEmbedCheck({ embeddable: false, reason: "x-frame-options" });
    render(<WebView url={GITHUB} />);

    fireLoadThenAdvance(300);
    await settle();
    restoreDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/embed-check?url=${encodeURIComponent(GITHUB)}`,
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(screen.getByText(/blocks embedding/i)).toBeDefined();
    const shot = document.querySelector<HTMLImageElement>("img[src*='/api/screenshot']");
    expect(shot).not.toBeNull();
    expect(shot?.getAttribute("src")).toBe(`/api/screenshot?url=${encodeURIComponent(GITHUB)}`);
  });

  it("watchdog timeout with unreadable document → blocked verdict → fallback panel", async () => {
    const restoreDocument = OVERRIDE_UNREADABLE();
    mockEmbedCheck({ embeddable: false, reason: "x-frame-options" });
    render(<WebView url={GITHUB} />);

    await act(async () => {
      vi.advanceTimersByTime(3600);
      await Promise.resolve();
    });
    restoreDocument();

    expect(fetchMock).toHaveBeenCalled();
    expect(screen.getByText(/blocks embedding/i)).toBeDefined();
    expect(document.querySelector("img[src*='/api/screenshot']")).not.toBeNull();
    expect(screen.queryByTitle("Website preview")).toBeNull();
  });

  it("unreadable load with an EMBEDDABLE verdict → the frame stays mounted, no fallback", async () => {
    // THE A2 hinge (Review Focus 1): a cross-origin frame that loads must not
    // be swapped to the fallback before a "blocked" verdict.
    const restoreDocument = OVERRIDE_UNREADABLE();
    mockEmbedCheck({ embeddable: true, reason: "ok" });
    render(<WebView url="https://projects.example/portfolio" />);

    fireLoadThenAdvance(300);
    await settle();
    restoreDocument();

    expect(screen.queryByText(/blocks embedding/i)).toBeNull();
    expect(screen.getByTitle("Website preview")).toBeDefined();
  });

  it("a pending verdict keeps the frame mounted — no fallback, no spinner", async () => {
    const restoreDocument = OVERRIDE_UNREADABLE();
    const resolveVerdict = mockPendingVerdict();
    render(<WebView url="https://projects.example/portfolio" />);

    fireLoadThenAdvance(300); // probe → verdict now in flight

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle("Website preview")).toBeDefined();
    expect(screen.queryByText(/blocks embedding/i)).toBeNull();
    // The frame renders the real site — no overlay may cover it while the
    // verdict flies.
    expect(screen.queryByText(/loading/i)).toBeNull();

    resolveVerdict();
    await settle();
    restoreDocument();

    expect(screen.getByTitle("Website preview")).toBeDefined();
  });

  it("the watchdog stands down while a verdict is pending (it must not re-fire a refusal)", async () => {
    const restoreDocument = OVERRIDE_UNREADABLE();
    const resolveVerdict = mockPendingVerdict();
    render(<WebView url="https://projects.example/portfolio" />);

    fireLoadThenAdvance(300); // verdict in flight
    act(() => {
      vi.advanceTimersByTime(3300); // total 3600 — crosses the 3500ms watchdog
    });

    // The deadline hit DURING the flight: no second probe, no refusal.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle("Website preview")).toBeDefined();
    expect(screen.queryByText(/blocks embedding/i)).toBeNull();

    resolveVerdict();
    await settle();
    restoreDocument();

    expect(screen.getByTitle("Website preview")).toBeDefined();
  });

  it("unmount aborts the in-flight verdict request", async () => {
    const restoreDocument = OVERRIDE_UNREADABLE();
    mockEmbedCheck({ embeddable: false, reason: "x-frame-options" });
    const { unmount } = render(<WebView url="https://projects.example/portfolio" />);

    fireLoadThenAdvance(300);
    restoreDocument();

    const signal = verdictSignal();
    unmount();
    expect(signal.aborted).toBe(true);

    // Settling after unmount must be a guarded no-op (no setState, no throw).
    await settle();
  });

  it("a url change aborts the in-flight verdict request", () => {
    const restoreDocument = OVERRIDE_UNREADABLE();
    mockEmbedCheck({ embeddable: false, reason: "x-frame-options" });
    const { rerender } = render(<WebView url="https://projects.example/a" />);

    fireLoadThenAdvance(300);
    restoreDocument();

    const signal = verdictSignal();
    rerender(<WebView url="https://projects.example/b" />);
    expect(signal.aborted).toBe(true);
    // The new url still owns a live mounted frame.
    expect(screen.getByTitle("Website preview")).toBeDefined();
  });

  it("a rejected verdict degrades to the live frame", async () => {
    const restoreDocument = OVERRIDE_UNREADABLE();
    fetchMock.mockRejectedValue(new Error("embed-check down"));
    vi.stubGlobal("fetch", fetchMock);
    render(<WebView url="https://projects.example/portfolio" />);

    fireLoadThenAdvance(300);
    await settle();
    restoreDocument();

    expect(screen.queryByText(/blocks embedding/i)).toBeNull();
    expect(screen.getByTitle("Website preview")).toBeDefined();
  });

  it("a non-ok embed-check response degrades to the live frame", async () => {
    const restoreDocument = OVERRIDE_UNREADABLE();
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<WebView url="https://projects.example/portfolio" />);

    fireLoadThenAdvance(300);
    await settle();
    restoreDocument();

    expect(screen.queryByText(/blocks embedding/i)).toBeNull();
    expect(screen.getByTitle("Website preview")).toBeDefined();
  });

  it("screenshot img onError degrades silently to the external-link-only panel", async () => {
    const restoreDocument = OVERRIDE_UNREADABLE();
    mockEmbedCheck({ embeddable: false, reason: "x-frame-options" });
    render(<WebView url={GITHUB} />);

    fireLoadThenAdvance(300);
    await settle();
    const shot = document.querySelector<HTMLImageElement>("img[src*='/api/screenshot']");
    expect(shot).not.toBeNull();
    restoreDocument();
    act(() => {
      fireEvent(shot as HTMLImageElement, new Event("error"));
    });

    expect(document.querySelector("img[src*='/api/screenshot']")).toBeNull();
    // External escape hatch stays available and never depends on the img.
    expect(screen.getByText(/Open in new tab/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();
  });

  it("retry from the fallback re-arms the iframe and clears the failure", async () => {
    const restoreDocument = OVERRIDE_UNREADABLE();
    mockEmbedCheck({ embeddable: false, reason: "x-frame-options" });
    render(<WebView url={GITHUB} />);

    await act(async () => {
      vi.advanceTimersByTime(3600);
      await Promise.resolve();
    });
    restoreDocument();
    expect(screen.getByText(/blocks embedding/i)).toBeDefined();

    act(() => {
      screen.getByRole("button", { name: /retry/i }).click();
    });

    expect(screen.queryByText(/blocks embedding/i)).toBeNull();
    expect(screen.getByTitle("Website preview")).toBeDefined();
  });
});
