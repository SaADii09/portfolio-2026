import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import sharp from "sharp";
import { GET, isAllowedUrl, resetScreenshotCache } from "@/app/api/screenshot/route";

// Interfaces pinned by Task 10 (WebView fallback), extended by the Phase 15
// preview work (route shrinks captures server-side):
//   GET /api/screenshot?url=<https-absolute>
//     → 200 jpeg bytes (sharp-resized from the capture's PNG), Cache-Control: public, max-age=86400
//     → 400 (non-https / unknown origin)
//     → 502 (Microlink failure) with body {"error":"screenshot unavailable"}

function makeRequest(search: string): Request {
  return { url: `http://localhost/api/screenshot${search}` } as unknown as Request;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockClear();
  resetScreenshotCache(); // module-scope cache would bleed bytes across tests
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Two-step simulated Microlink flow: first outbound fetch resolves the
 * screenshot URL from JSON, second fetches the actual image bytes. The mock
 * carries a REAL 4×4 PNG — the route runs sharp over the bytes, and sharp
 * rejects malformed images.
 */
const TINY_PNG = await sharp({
  create: { width: 4, height: 4, channels: 3, background: "#d8b913" },
})
  .png()
  .toBuffer();

function mockScreenshotFlow(screenshotUrl = "https://cdn.microlink.io/shot.png") {
  fetchMock
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { screenshot: { url: screenshotUrl } } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: new Response(new Uint8Array(TINY_PNG)).body,
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" ? "image/png" : null),
      },
    });
}

function bytesFetchUrl(): string {
  return fetchMock.mock.calls[1]?.[0] as string;
}

describe("isAllowedUrl", () => {
  it("allows urls on origins derived from PROJECTS", () => {
    expect(isAllowedUrl("https://github.com/SaADii09/devos")).toBe(true);
    expect(isAllowedUrl("https://github.com")).toBe(true);
  });

  it("delegates the exact github.com eligibility pinned by the module", () => {
    // github.com stays eligible (Review Focus 5): the route name is kept while
    // the decision moves to src/lib/screenshot-allowlist.ts.
    expect(isAllowedUrl("https://github.com/SaADii09")).toBe(true);
  });

  it("allows a deployed demo origin derived from PROJECTS", () => {
    expect(isAllowedUrl("https://portfolio-2026-sp9k.vercel.app")).toBe(true);
  });

  it("rejects non-https urls even on an allow-listed origin", () => {
    expect(isAllowedUrl("http://github.com/SaADii09/devos")).toBe(false);
  });

  it("rejects unknown origins", () => {
    expect(isAllowedUrl("https://evil.example/page")).toBe(false);
  });

  it("rejects unparseable input", () => {
    expect(isAllowedUrl("not a url")).toBe(false);
  });
});

describe("GET route", () => {
  it("returns 400 for an unknown origin without making outbound calls", async () => {
    const res = await GET(makeRequest("?url=https://evil.example/page"));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-https url without making outbound calls", async () => {
    const res = await GET(makeRequest("?url=http://github.com/SaADii09/devos"));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the url param is missing", async () => {
    const res = await GET(makeRequest(""));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 bodies never echo the rejected url", async () => {
    const res = await GET(makeRequest("?url=https://evil.example/secret-page"));
    const text = await res.text();

    expect(text).not.toContain("evil.example");
    expect(text).not.toContain("secret-page");
  });

  it("serves the capture as a route-resized jpeg with cache headers", async () => {
    mockScreenshotFlow();

    const res = await GET(makeRequest("?url=https://github.com/SaADii09/devos"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    // The served bytes are real JPEG (SOI marker), not the capture's PNG body.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    expect(bytesFetchUrl()).toBe("https://cdn.microlink.io/shot.png");
  });

  it("still encodes the requested url for Microlink on the outbound request", async () => {
    mockScreenshotFlow();

    await GET(makeRequest("?url=https%3A%2F%2Fgithub.com%2FSaADii09%2Fdevos%20"));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.microlink.io/?url=https%3A%2F%2Fgithub.com%2FSaADii09%2Fdevos%20&screenshot=true&meta=false",
    );
  });

  it("serves a github.com-profile capture — github.com stays a 400-bypass origin", async () => {
    mockScreenshotFlow();

    const res = await GET(makeRequest("?url=https://github.com/SaADii09"));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 502 with the fixed body when Microlink fails", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });

    const res = await GET(makeRequest("?url=https://github.com/SaADii09/devos"));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "screenshot unavailable" });
  });

  it("serves a repeat request from the in-memory cache without a second Microlink round-trip", async () => {
    mockScreenshotFlow();

    const first = await GET(makeRequest("?url=https://github.com/SaADii09/devos"));
    expect(first.status).toBe(200);

    const second = await GET(makeRequest("?url=https://github.com/SaADii09/devos"));
    expect(second.status).toBe(200);
    expect(second.headers.get("content-type")).toBe("image/jpeg");
    // Only the initial capture (2 fetches) ran; the repeat must hit the cache.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one cache entry across query-string variants of the same path", async () => {
    // The cache keys on origin + pathname: a `?utm=…` suffix must not
    // trigger a second Microlink capture on a public, unauthenticated route.
    mockScreenshotFlow();

    const first = await GET(
      makeRequest(`?url=${encodeURIComponent("https://github.com/SaADii09/devos?utm_source=a")}`),
    );
    expect(first.status).toBe(200);

    const second = await GET(
      makeRequest(`?url=${encodeURIComponent("https://github.com/SaADii09/devos?utm_source=b")}`),
    );
    expect(second.status).toBe(200);
    expect(second.headers.get("content-type")).toBe("image/jpeg");
    // Only the initial capture (2 fetches) ran — the variant hit the cache.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 502 when Microlink resolves no screenshot url", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: {} }) });

    const res = await GET(makeRequest("?url=https://github.com/SaADii09/devos"));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "screenshot unavailable" });
  });

  it("returns 502 when fetching the image bytes fails", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { screenshot: { url: "https://cdn.microlink.io/shot.png" } } }),
      })
      .mockResolvedValueOnce({ ok: false, status: 503 });

    const res = await GET(makeRequest("?url=https://github.com/SaADii09/devos"));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "screenshot unavailable" });
  });

  it("returns 502 when the capture bytes are not an image — a 200 HTML page is never relayed", async () => {
    // Upstream answers 200 with a valid body but a text/html content-type:
    // whatever those bytes are, they are not the requested screenshot. The
    // route must reject them, never relay them into the cache/resize path.
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { screenshot: { url: "https://cdn.microlink.io/shot.png" } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new Response(new Uint8Array(TINY_PNG)).body,
        headers: {
          get: (name: string) => (name.toLowerCase() === "content-type" ? "text/html" : null),
        },
      });

    const res = await GET(makeRequest("?url=https://github.com/SaADii09/devos"));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "screenshot unavailable" });
  });

  it("time-bounds both outbound legs — each fetch receives its own abort signal", async () => {
    // Wiring proof, not a wait: the pins assert the fetches RECEIVED an
    // AbortSignal (fresh per leg), which is what makes a hung upstream
    // time-bounded, without parking the suite for 15s.
    mockScreenshotFlow();

    await GET(makeRequest("?url=https://github.com/SaADii09/devos"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [captureInit, bytesInit] = fetchMock.mock.calls.map(
      (call) => call[1] as { signal?: unknown } | undefined,
    );
    expect(captureInit?.signal).toBeInstanceOf(AbortSignal);
    expect(bytesInit?.signal).toBeInstanceOf(AbortSignal);
    // Two legs, two deadlines — never one shared signal.
    expect(captureInit?.signal).not.toBe(bytesInit?.signal);
  });

  it("502 bodies never echo the upstream screenshot url", async () => {
    fetchMock.mockRejectedValueOnce(new Error("upstream down"));

    const res = await GET(makeRequest("?url=https://github.com/SaADii09/devos"));
    const text = await res.text();

    expect(text).toBe('{"error":"screenshot unavailable"}');
    expect(text).not.toContain("microlink");
    expect(text).not.toContain("github.com");
  });
});

/**
 * URL-aware Microlink mock for the eviction pin: the Microlink API answers
 * with a fresh screenshot URL, the image URL answers with the PNG bytes.
 *
 * The image answer must carry a FRESH body per call: the route re-reads the
 * body through `new Response(image.body)`, and a ReadableStream can be read
 * only once — a shared body instance fails on the SECOND capture (the route
 * then answers 502, because the unusable body throws inside the capture).
 */
function mockMicrolinkFlow() {
  let shot = 0;
  fetchMock.mockImplementation((url: string) => {
    if (url.startsWith("https://api.microlink.io/")) {
      shot += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          data: { screenshot: { url: `https://cdn.microlink.io/shot-${shot}.png` } },
        }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      body: new Response(new Uint8Array(TINY_PNG)).body,
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" ? "image/png" : null),
      },
    });
  });
}

describe("GET /api/screenshot — the cache eviction order", () => {
  it("evicts the OLDEST insertion at the cap, not the most recent", async () => {
    mockMicrolinkFlow();
    const paths = Array.from(
      { length: 33 },
      (_, index) => `https://github.com/SaADii09/repo-${index}`,
    );

    for (const path of paths) {
      const res = await GET(makeRequest(`?url=${encodeURIComponent(path)}`));
      expect(res.status).toBe(200);
    }

    // 33 captures × 2 upstream fetches each (the API call + the bytes).
    expect(fetchMock).toHaveBeenCalledTimes(66);

    // The FIRST cached path was evicted (insertion-order eviction at 32) —
    // it must be captured again.
    const first = await GET(makeRequest(`?url=${encodeURIComponent(paths[0]!)}`));
    expect(first.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(68);

    // The LAST cached path is still cached — no new capture.
    const last = await GET(makeRequest(`?url=${encodeURIComponent(paths[32]!)}`));
    expect(last.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(68);
  });

  it("starts from a clean slate after a cache reset", async () => {
    mockMicrolinkFlow();
    const path = "https://github.com/SaADii09/repo-0";

    await GET(makeRequest(`?url=${encodeURIComponent(path)}`));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resetScreenshotCache();

    await GET(makeRequest(`?url=${encodeURIComponent(path)}`));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
