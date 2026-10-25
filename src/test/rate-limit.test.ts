import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/chat/route";
import { GET as embedCheckGET } from "@/app/api/embed-check/route";
import { createRateLimiter } from "@/lib/rate-limit";

/**
 * Unit contract for the per-IP rate limiter (src/lib/rate-limit.ts) plus the
 * routes' prune() wiring.
 *
 * Honesty note: prune() is memory hygiene. isLimited() already prunes the
 * queried address's stamps on every check, so a sweep is behaviorally
 * INVISIBLE through the limiter interface — no test can distinguish a swept
 * map from a self-pruning one, and a pin claiming otherwise would be a
 * tautology. What can be pinned honestly is pinned here:
 *   - the sweep PRESERVES in-window stamps (a wipe-all prune would break the
 *     limit for active addresses — the distinguishing behavior pin);
 *   - past the window, a swept address bursts fresh (the sweep's composition
 *     contract with isLimited);
 *   - the routes invoke prune() once per request — a spy wrapped around the
 *     module factory, since the routes own module-scope limiters that no
 *     test can reach otherwise. This is the wiring witness; the limiter's
 *     own options are pinned alongside it.
 */

// vi.hoisted: the mock factory is hoisted above the imports, so the state it
// mutates must be created by vitest's own hoisting pass.
const pruneWiring = vi.hoisted(() => ({ calls: 0, options: [] as Array<{ windowMs: number }> }));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    createRateLimiter: (options: Parameters<typeof actual.createRateLimiter>[0]) => {
      const limiter = actual.createRateLimiter(options);
      pruneWiring.options.push({ windowMs: options.windowMs });
      return {
        ...limiter,
        prune: () => {
          pruneWiring.calls += 1;
          limiter.prune();
        },
      };
    },
  };
});

describe("createRateLimiter().prune()", () => {
  it("keeps in-window stamps: an address at the cap stays limited right after a sweep", () => {
    // The distinguishing pin: a prune that wiped LIVE entries would drop the
    // limit for an address that is actively hammering the route.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
      limiter.isLimited("203.0.113.8");
      limiter.isLimited("203.0.113.8");
      expect(limiter.isLimited("203.0.113.8")).toBe(true);

      limiter.prune(); // no time has passed — nothing may be dropped

      expect(limiter.isLimited("203.0.113.8")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops aged stamps: past the window, a swept address bursts fresh", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
      for (let i = 0; i < 3; i += 1) expect(limiter.isLimited("203.0.113.7")).toBe(false);
      expect(limiter.isLimited("203.0.113.7")).toBe(true);

      vi.setSystemTime(120_000); // past the window
      limiter.prune();

      expect(limiter.isLimited("203.0.113.7")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is a safe no-op on a limiter that never recorded an address", () => {
    expect(() => createRateLimiter({ limit: 1, windowMs: 60_000 }).prune()).not.toThrow();
  });
});

describe("prune() wiring — the routes sweep the map per request", () => {
  beforeEach(() => {
    pruneWiring.calls = 0;
  });

  it("POST /api/chat prunes before its limit check, once per request", async () => {
    // An unparsable body keeps the pin off the provider path: the limiter
    // section runs first, then the 400.
    const request = () =>
      new Request("http://localhost/api/chat", { method: "POST", body: "{not json" });

    expect((await POST(request())).status).toBe(400);
    expect((await POST(request())).status).toBe(400);
    expect(pruneWiring.calls).toBe(2);
  });

  it("GET /api/embed-check prunes before its limit check, once per request", async () => {
    // No url param → 400 before any DNS lookup or outbound probe.
    const request = () => new Request("http://localhost/api/embed-check");

    expect((await embedCheckGET(request())).status).toBe(400);
    expect((await embedCheckGET(request())).status).toBe(400);
    expect(pruneWiring.calls).toBe(2);
  });

  it("every limiter created through the module carries the 60s window", () => {
    // Creation-order independent: the routes build their limiters at module
    // scope, and this suite builds its own — every one of them must carry the
    // hardcoded 60s window (the limit itself is env-derived on /api/chat and
    // is deliberately not pinned here).
    expect(pruneWiring.options.length).toBeGreaterThan(0);
    expect(pruneWiring.options.every((option) => option.windowMs === 60_000)).toBe(true);
  });
});
