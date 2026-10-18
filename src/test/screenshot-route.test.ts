import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, isAllowedUrl } from "@/app/api/screenshot/route";

// Interfaces pinned by Task 10 (WebView fallback):
//   GET /api/screenshot?url=<https-absolute>
//     → 200 image bytes (content-type: image/*, Cache-Control: public, max-age=86400)
//     → 400 (non-https / unknown origin)
//     → 502 (Microlink failure) with body {"error":"screenshot unavailable"}

function makeRequest(search: string): Request {
  return { url: `http://localhost/api/screenshot${search}` } as unknown as Request;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Two-step simulated Microlink flow: first outbound fetch resolves the
 * screenshot URL from JSON, second fetches the actual image bytes.
 */
function mockScreenshotFlow(screenshotUrl = "https://cdn.microlink.io/shot.png") {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic
  fetchMock
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { screenshot: { url: screenshotUrl } } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: new Response(bytes).body,
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

  it("proxies the resolved screenshot bytes with image content-type and cache headers", async () => {
    mockScreenshotFlow();

    const res = await GET(makeRequest("?url=https://github.com/SaADii09/devos"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    await expect(res.arrayBuffer()).resolves.toEqual(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer,
    );
    expect(bytesFetchUrl()).toBe("https://cdn.microlink.io/shot.png");
  });

  it("still encodes the requested url for Microlink on the outbound request", async () => {
    mockScreenshotFlow();

    await GET(makeRequest("?url=https%3A%2F%2Fgithub.com%2FSaADii09%2Fdevos%20"));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.microlink.io/?url=https%3A%2F%2Fgithub.com%2FSaADii09%2Fdevos%20&screenshot=true&meta=false",
    );
  });

  it("returns 502 with the fixed body when Microlink fails", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });

    const res = await GET(makeRequest("?url=https://github.com/SaADii09/devos"));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "screenshot unavailable" });
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

  it("502 bodies never echo the upstream screenshot url", async () => {
    fetchMock.mockRejectedValueOnce(new Error("upstream down"));

    const res = await GET(makeRequest("?url=https://github.com/SaADii09/devos"));
    const text = await res.text();

    expect(text).toBe('{"error":"screenshot unavailable"}');
    expect(text).not.toContain("microlink");
    expect(text).not.toContain("github.com");
  });
});
