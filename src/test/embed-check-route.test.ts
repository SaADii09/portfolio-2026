import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lookup } from "node:dns/promises";

import { GET, resetEmbedCheckCache } from "@/app/api/embed-check/route";
import { siteUrl } from "@/lib/site";

// Interface pinned by Task A1 (embed verdict route):
//   GET /api/embed-check?url=<https-url>
//     → 200 { embeddable: boolean, reason: "ok" | "x-frame-options" | "csp-frame-ancestors" }
//     → 400 fixed body {"error":"invalid url"} — non-https, unparsable, or a
//       hostname resolving to a private/loopback/link-local address (never fetch)
//     → 502 fixed body {"error":"unreachable"} — timeout, network error, or a
//       redirect chain whose FINAL response.url is not https
// The route reads HEADERS ONLY (never a body), honors a 6h/32 cache, and its
// DNS + scheme guards fail closed.

// node:dns/promises carries a default export alongside `lookup` — the mock
// factory must answer both shapes, sharing ONE fn so vi.mocked(lookup) sees
// every call. The fn is created inside the factory: vi.mock is hoisted above
// top-level declarations, so it must not reach for module-scope bindings.
vi.mock("node:dns/promises", () => {
  const lookup = vi.fn();
  return { lookup, default: { lookup } };
});

// The real signature's overloads defeat vi.mocked's inference; the route only
// ever calls `lookup(host, { all: true })` and consumes address records.
const lookupMock = vi.mocked(
  lookup as unknown as (
    host: string,
    options: { all: boolean },
  ) => Promise<Array<{ address: string; family: number }>>,
);

/** The public address the DNS stub answers with unless a pin overrides it. */
const PUBLIC_ADDRESS = { address: "93.184.216.34", family: 4 as const };

function makeRequest(search: string): Request {
  return { url: `http://localhost/api/embed-check${search}` } as unknown as Request;
}

const OUR_ORIGIN = new URL(siteUrl).origin;

const fetchMock = vi.fn();

interface MockResponseInit {
  status: number;
  headers?: Record<string, string>;
  /** The FINAL url the fetch landed on (redirect targets matter). */
  url?: string;
}

/** A {ok, status, url, headers}-shaped response — the route's whole surface. */
function headerResponse(init: MockResponseInit) {
  return {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    url: init.url ?? "https://target.example/page",
    headers: {
      get: (name: string) => init.headers?.[name.toLowerCase()] ?? null,
    },
  };
}

beforeEach(() => {
  fetchMock.mockClear();
  lookupMock.mockReset();
  resetEmbedCheckCache(); // module-scope cache would bleed verdicts across tests
  vi.stubGlobal("fetch", fetchMock);
  lookupMock.mockResolvedValue([PUBLIC_ADDRESS]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SSRF guards — the 400 gate", () => {
  it("rejects a non-https url without fetching or resolving", async () => {
    const res = await GET(makeRequest(`?url=${encodeURIComponent("http://example.com/page")}`));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid url" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects an unparsable url", async () => {
    const res = await GET(makeRequest(`?url=${encodeURIComponent("not a url")}`));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing url param", async () => {
    const res = await GET(makeRequest(""));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 bodies never echo the rejected url", async () => {
    const res = await GET(
      makeRequest(`?url=${encodeURIComponent("http://secret.example/private")}`),
    );

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toBe('{"error":"invalid url"}');
    expect(text).not.toContain("secret.example");
  });

  it("rejects a hostname the DNS resolves to a loopback address (zero fetches)", async () => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 as const }]);

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://internal.example/")}`));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects EVERY private/loopback/link-local range the DNS can answer", async () => {
    const forbidden = [
      "10.1.2.3",
      "172.31.9.9",
      "192.168.0.7",
      "169.254.1.1",
      "0.0.0.0",
      "::1",
      "fd00::5",
      "fe80::a",
    ];

    for (const address of forbidden) {
      lookupMock.mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }]);
      const res = await GET(makeRequest(`?url=${encodeURIComponent("https://host.example/")}`));
      expect(res.status, `address ${address} must refuse`).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("rejects the FIRST private record even when a public one is also listed", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 as const },
      { address: "10.0.0.2", family: 4 as const },
    ]);

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://host.example/")}`));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a literal loopback IP without consulting DNS", async () => {
    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://127.0.0.1/x")}`));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
  });
});

describe("verdicts from response headers", () => {
  it("blocks on X-Frame-Options: DENY", async () => {
    fetchMock.mockResolvedValueOnce(
      headerResponse({ status: 200, headers: { "x-frame-options": "DENY" } }),
    );

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ embeddable: false, reason: "x-frame-options" });
  });

  it("blocks on X-Frame-Options: SAMEORIGIN, case-insensitively", async () => {
    fetchMock.mockResolvedValueOnce(
      headerResponse({ status: 200, headers: { "x-frame-options": "sameorigin" } }),
    );

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: false, reason: "x-frame-options" });
  });

  it("blocks on CSP frame-ancestors 'none'", async () => {
    fetchMock.mockResolvedValueOnce(
      headerResponse({
        status: 200,
        headers: { "content-security-policy": "default-src 'self'; frame-ancestors 'none'" },
      }),
    );

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({
      embeddable: false,
      reason: "csp-frame-ancestors",
    });
  });

  it("allows a frame-ancestors directive listing OUR origin", async () => {
    fetchMock.mockResolvedValueOnce(
      headerResponse({
        status: 200,
        headers: {
          "content-security-policy": `frame-ancestors 'self' ${OUR_ORIGIN}`,
        },
      }),
    );

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
  });

  it("allows a scheme-less frame-ancestors source equivalent to our host", async () => {
    // Host sources may carry no scheme; the port-bearing token must then
    // equal our origin's host exactly ("localhost:3000" in the default env).
    fetchMock.mockResolvedValueOnce(
      headerResponse({
        status: 200,
        headers: { "content-security-policy": "frame-ancestors localhost:3000" },
      }),
    );

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
  });

  it("allows the frame-ancestors wildcard", async () => {
    fetchMock.mockResolvedValueOnce(
      headerResponse({
        status: 200,
        headers: { "content-security-policy": "frame-ancestors *" },
      }),
    );

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
  });

  it("embeddable when no CSP carries a frame-ancestors directive", async () => {
    fetchMock.mockResolvedValueOnce(
      headerResponse({
        status: 200,
        headers: { "content-security-policy": "default-src 'none'" },
      }),
    );

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
  });

  it("embeddable with no framing headers at all", async () => {
    fetchMock.mockResolvedValueOnce(headerResponse({ status: 200 }));

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
  });

  it("blocks a frame-ancestors list naming someone else", async () => {
    fetchMock.mockResolvedValueOnce(
      headerResponse({
        status: 200,
        headers: { "content-security-policy": "frame-ancestors 'self' https://other.example" },
      }),
    );

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({
      embeddable: false,
      reason: "csp-frame-ancestors",
    });
  });
});

describe("the HEAD-first probe", () => {
  it("falls back to GET when HEAD answers 405", async () => {
    fetchMock
      .mockResolvedValueOnce(headerResponse({ status: 405 }))
      .mockResolvedValueOnce(headerResponse({ status: 200 }));

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "HEAD", redirect: "follow" });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "GET", redirect: "follow" });
  });

  it("falls back to GET when HEAD answers 501", async () => {
    fetchMock
      .mockResolvedValueOnce(headerResponse({ status: 501 }))
      .mockResolvedValueOnce(
        headerResponse({ status: 200, headers: { "x-frame-options": "DENY" } }),
      );

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: false, reason: "x-frame-options" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("unreachability — the 502 gate", () => {
  it("returns 502 when the upstream fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("upstream down"));

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    expect(res.status).toBe(502);
    expect(await res.text()).toBe('{"error":"unreachable"}');
  });

  it("returns 502 when the request times out via the abort controller", async () => {
    vi.useFakeTimers();
    try {
      // A hung upstream: only the route's own 5s abort can settle the request.
      fetchMock.mockImplementation(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      );

      const pending = GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));
      await vi.advanceTimersByTimeAsync(5000);
      const res = await pending;

      expect(res.status).toBe(502);
      expect(await res.text()).toBe('{"error":"unreachable"}');
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns 502 when a redirect chain ends at a non-https url", async () => {
    fetchMock.mockResolvedValueOnce(
      headerResponse({ status: 200, url: "http://final.example/landing" }),
    );

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    expect(res.status).toBe(502);
    expect(await res.text()).toBe('{"error":"unreachable"}');
  });
});

describe("the verdict cache (6h, cap 32)", () => {
  it("serves a repeat verdict without a second upstream probe", async () => {
    fetchMock.mockResolvedValue(headerResponse({ status: 200 }));

    const first = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));
    await expect(second.json()).resolves.toEqual(await first.json());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one cache entry across query-string variants of the same path", async () => {
    fetchMock.mockResolvedValue(headerResponse({ status: 200 }));

    await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/page?utm=a")}`));
    await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/page?utm=b")}`));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("evicts the OLDEST insertion at the cap, not the most recent", async () => {
    fetchMock.mockResolvedValue(headerResponse({ status: 200 }));
    const paths = Array.from({ length: 33 }, (_, index) => `https://target.example/repo-${index}`);

    for (const path of paths) {
      await GET(makeRequest(`?url=${encodeURIComponent(path)}`));
    }
    expect(fetchMock).toHaveBeenCalledTimes(33);

    // The FIRST verdict was evicted — re-probing it costs an upstream call.
    await GET(makeRequest(`?url=${encodeURIComponent(paths[0]!)}`));
    expect(fetchMock).toHaveBeenCalledTimes(34);

    // The LAST verdict is still cached — no new probe.
    await GET(makeRequest(`?url=${encodeURIComponent(paths[32]!)}`));
    expect(fetchMock).toHaveBeenCalledTimes(34);
  });

  it("starts from a clean slate after a cache reset", async () => {
    fetchMock.mockResolvedValue(headerResponse({ status: 200 }));
    const path = `?url=${encodeURIComponent("https://target.example/repo-0")}`;

    await GET(makeRequest(path));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resetEmbedCheckCache();

    await GET(makeRequest(path));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
