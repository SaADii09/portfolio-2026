import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lookup } from "node:dns/promises";
import { request } from "node:https";

import { GET, resetEmbedCheckCache } from "@/app/api/embed-check/route";
import { siteUrl } from "@/lib/site";

// Interface pinned by Task A1 (embed verdict route):
//   GET /api/embed-check?url=<https-url>
//     → 200 { embeddable: boolean, reason: "ok" | "x-frame-options" | "csp-frame-ancestors" }
//     → 400 fixed body {"error":"invalid url"} — non-https, unparsable, or a
//       hostname resolving to a private/loopback/link-local address (never fetched)
//     → 502 fixed body {"error":"unreachable"} — timeout, network error, or a
//       redirect hop that fails re-validation
// The route reads HEADERS ONLY (never a body), honors a 6h/32 cache plus a
// 60s failure cache, and its DNS + scheme guards fail closed.
//
// The outbound leg is `node:https` — NEVER the ambient `fetch`: the vetted
// address is PINNED into the connection through a custom `lookup`, so the
// socket cannot be re-resolved to a private address between the check and the
// connect (the DNS-rebinding TOCTOU). The ambient fetch is stubbed as a
// tripwire: a single call to it fails the suite.

// node:dns/promises carries a default export alongside `lookup` — the mock
// factory must answer both shapes, sharing ONE fn so vi.mocked(lookup) sees
// every call. The fn is created inside the factory: vi.mock is hoisted above
// top-level declarations, so it must not reach for module-scope bindings.
vi.mock("node:dns/promises", () => {
  const lookup = vi.fn();
  return { lookup, default: { lookup } };
});

// The same shape for node:https — the route's ONLY outbound transport.
vi.mock("node:https", () => {
  const request = vi.fn();
  return { request, default: { request } };
});

// The real signature's overloads defeat vi.mocked's inference; the route only
// ever calls `lookup(host, { all: true })` and consumes address records.
const lookupMock = vi.mocked(
  lookup as unknown as (
    host: string,
    options: { all: boolean },
  ) => Promise<Array<{ address: string; family: number }>>,
);

interface MockLookupOptions {
  all?: boolean;
}

type MockLookup = (
  hostname: string,
  options: MockLookupOptions,
  callback: (
    err: Error | null,
    address: string | Array<{ address: string; family: number }>,
    family?: number,
  ) => void,
) => void;

interface MockRequestOptions {
  method?: string;
  timeout?: number;
  headers?: Record<string, string>;
  lookup?: MockLookup;
}

interface MockResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  destroy: () => void;
  on: (event: string, handler: () => void) => void;
}

interface MockClientRequest {
  on: (event: string, handler: () => void) => void;
  destroy: () => void;
  /** The transport only sends the request when `end()` is called. */
  end: () => void;
}

const requestMock = vi.mocked(
  request as unknown as (
    url: string,
    options: MockRequestOptions,
    callback: (response: MockResponse) => void,
  ) => MockClientRequest,
);

/** The public address the DNS stub answers with unless a pin overrides it. */
const PUBLIC_ADDRESS = { address: "93.184.216.34", family: 4 as const };

/** One upstream answer the mocked transport will hand back. */
interface MockHop {
  status?: number;
  headers?: Record<string, string | string[]>;
  /** The upstream never answers — the route's own timeout must fire. */
  hang?: boolean;
  /** The upstream connection fails outright. */
  fail?: boolean;
}

const hops: MockHop[] = [];
const requested: Array<{ url: string; options: MockRequestOptions }> = [];
const dnsAnswers = new Map<string, Array<{ address: string; family: number }>>();

function queueHop(hop: MockHop): void {
  hops.push(hop);
}

function mockResponse(hop: MockHop): MockResponse {
  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(hop.headers ?? {})) {
    headers[name.toLowerCase()] = value;
  }
  return {
    statusCode: hop.status ?? 200,
    headers,
    destroy: () => undefined,
    on: () => undefined,
  };
}

function makeRequest(search: string, origin = "http://localhost"): Request {
  return { url: `${origin}/api/embed-check${search}` } as unknown as Request;
}

const OUR_ORIGIN = new URL(siteUrl).origin;

/** The ambient fetch must never be used — the route pins its own transport. */
const fetchMock = vi.fn(() => Promise.reject(new Error("ambient fetch is forbidden")));

beforeEach(() => {
  hops.length = 0;
  requested.length = 0;
  dnsAnswers.clear();
  fetchMock.mockClear();
  lookupMock.mockReset();
  resetEmbedCheckCache(); // module-scope cache would bleed verdicts across tests
  vi.stubGlobal("fetch", fetchMock);
  lookupMock.mockImplementation(async (host: string) => dnsAnswers.get(host) ?? [PUBLIC_ADDRESS]);
  requestMock.mockReset();
  requestMock.mockImplementation((url, options, callback) => {
    requested.push({ url, options });
    const hop = hops.shift() ?? {};
    const handlers: Record<string, (() => void) | undefined> = {};
    const client: MockClientRequest = {
      on: (event, handler) => {
        handlers[event] = handler;
      },
      destroy: () => undefined,
      // The response only arrives when the request is actually SENT. A route
      // that forgets `end()` therefore hangs until its own timeout instead of
      // silently "passing" against a mock that answered on its own.
      end: () => {
        void Promise.resolve().then(() => {
          if (hop.fail) {
            handlers.error?.();
            return;
          }
          if (hop.hang) {
            handlers.timeout?.();
            return;
          }
          callback(mockResponse(hop));
        });
      },
    };
    return client;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The urls the route actually asked for, in order. */
function requestedUrls(): string[] {
  return requested.map((entry) => entry.url);
}

/** Invoke the lookup the route handed to the transport — the PINNED address. */
function invokePinnedLookup(
  index: number,
  hostname = "host.example",
): Promise<{ address: string; family: number }> {
  return new Promise((resolve, reject) => {
    const lookupFn = requested[index]?.options.lookup;
    if (lookupFn === undefined) {
      reject(new Error("the request carried no lookup"));
      return;
    }
    lookupFn(hostname, { all: false }, (err, address, family) => {
      if (err !== null) {
        reject(err);
        return;
      }
      resolve({ address: String(address), family: family ?? 0 });
    });
  });
}

describe("SSRF guards — the 400 gate", () => {
  it("rejects a non-https url without fetching or resolving", async () => {
    const res = await GET(makeRequest(`?url=${encodeURIComponent("http://example.com/page")}`));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid url" });
    expect(requestMock).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects an unparsable url", async () => {
    const res = await GET(makeRequest(`?url=${encodeURIComponent("not a url")}`));

    expect(res.status).toBe(400);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("rejects a missing url param", async () => {
    const res = await GET(makeRequest(""));

    expect(res.status).toBe(400);
    expect(requestMock).not.toHaveBeenCalled();
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

  it("rejects a hostname the DNS resolves to a loopback address (zero outbound calls)", async () => {
    dnsAnswers.set("internal.example", [{ address: "127.0.0.1", family: 4 }]);

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://internal.example/")}`));

    expect(res.status).toBe(400);
    expect(requestMock).not.toHaveBeenCalled();
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
      dnsAnswers.set("host.example", [{ address, family: address.includes(":") ? 6 : 4 }]);
      const res = await GET(makeRequest(`?url=${encodeURIComponent("https://host.example/")}`));
      expect(res.status, `address ${address} must refuse`).toBe(400);
      expect(requestMock, `address ${address} must not be requested`).not.toHaveBeenCalled();
    }
  });

  it("rejects the FIRST private record even when a public one is also listed", async () => {
    dnsAnswers.set("host.example", [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.2", family: 4 },
    ]);

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://host.example/")}`));

    expect(res.status).toBe(400);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("rejects a literal loopback IP without consulting DNS", async () => {
    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://127.0.0.1/x")}`));

    expect(res.status).toBe(400);
    expect(requestMock).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
  });
});

describe("the address normalization — IPv4-mapped and IPv4-compatible IPv6", () => {
  // The WHATWG URL parser rewrites an IPv4-mapped literal to HEX
  // ("[::ffff:127.0.0.1]" → "[::ffff:7f00:1]") and dns.lookup answers in
  // that same hex form. A dotted-quad-only check would wave all of these
  // straight through to a private target.
  const mapped: ReadonlyArray<readonly [string, string]> = [
    ["::ffff:7f00:1", "127.0.0.1"],
    ["::ffff:a9fe:a9fe", "169.254.169.254"],
    ["::ffff:a00:1", "10.0.0.1"],
    ["::ffff:c0a8:101", "192.168.1.1"],
    ["::ffff:127.0.0.1", "127.0.0.1"],
  ];

  it("refuses an IPv4-MAPPED answer in its hex form", async () => {
    for (const [address] of mapped) {
      dnsAnswers.set("mapped.example", [{ address, family: 6 }]);
      const res = await GET(makeRequest(`?url=${encodeURIComponent("https://mapped.example/")}`));
      expect(res.status, `address ${address} must refuse`).toBe(400);
      expect(requestMock, `address ${address} must not be requested`).not.toHaveBeenCalled();
      expect(fetchMock, `address ${address} must not reach the transport`).not.toHaveBeenCalled();
    }
  });

  it("refuses an IPv4-MAPPED literal written in the url", async () => {
    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://[::ffff:7f00:1]/x")}`));

    expect(res.status).toBe(400);
    expect(requestMock).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("refuses an IPv4-MAPPED literal written with a dotted tail", async () => {
    const res = await GET(
      makeRequest(`?url=${encodeURIComponent("https://[::ffff:127.0.0.1]/x")}`),
    );

    expect(res.status).toBe(400);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("refuses the IPv4-COMPATIBLE form", async () => {
    for (const address of ["::7f00:1", "::a9fe:a9fe", "::127.0.0.1"]) {
      dnsAnswers.set("compat.example", [{ address, family: 6 }]);
      const res = await GET(makeRequest(`?url=${encodeURIComponent("https://compat.example/")}`));
      expect(res.status, `address ${address} must refuse`).toBe(400);
      expect(requestMock, `address ${address} must not be requested`).not.toHaveBeenCalled();
    }
  });

  it("refuses an IPv4-COMPATIBLE literal written in the url", async () => {
    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://[::7f00:1]/x")}`));

    expect(res.status).toBe(400);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("refuses the 6to4 and NAT64 forms that carry a private address", async () => {
    const embedded = ["2002:7f00:1::", "2002:a9fe:a9fe::", "64:ff9b::7f00:1", "64:ff9b::a9fe:a9fe"];

    for (const address of embedded) {
      dnsAnswers.set("embedded.example", [{ address, family: 6 }]);
      const res = await GET(makeRequest(`?url=${encodeURIComponent("https://embedded.example/")}`));
      expect(res.status, `address ${address} must refuse`).toBe(400);
      expect(requestMock, `address ${address} must not be requested`).not.toHaveBeenCalled();
    }
  });

  it("still allows a public IPv6 address", async () => {
    dnsAnswers.set("v6.example", [{ address: "2606:4700:4700::1111", family: 6 }]);

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://v6.example/")}`));

    expect(res.status).toBe(200);
  });
});

describe("the extended IPv4 forbidden table", () => {
  const forbidden = [
    "100.64.0.1", // CGNAT (100.64.0.0/10)
    "100.100.100.200", // CGNAT — the Alibaba/Tencent metadata address
    "100.127.255.255", // CGNAT upper edge
    "192.0.0.1", // IETF protocol assignments (192.0.0.0/24)
    "192.0.0.255", // 192.0.0.0/24 upper edge
    "198.18.0.1", // benchmarking (198.18.0.0/15)
    "198.19.255.255", // 198.18.0.0/15 upper edge
    "240.0.0.1", // reserved (240.0.0.0/4)
    "255.255.255.255", // broadcast — inside 240.0.0.0/4
  ];

  it("refuses every extended range at the gate", async () => {
    for (const address of forbidden) {
      dnsAnswers.set("extended.example", [{ address, family: 4 }]);
      const res = await GET(makeRequest(`?url=${encodeURIComponent("https://extended.example/")}`));
      expect(res.status, `address ${address} must refuse`).toBe(400);
      expect(requestMock, `address ${address} must not be requested`).not.toHaveBeenCalled();
    }
  });

  it("refuses an extended-range literal written in the url", async () => {
    for (const address of forbidden) {
      const res = await GET(makeRequest(`?url=${encodeURIComponent(`https://${address}/x`)}`));
      expect(res.status, `address ${address} must refuse`).toBe(400);
      expect(requestMock, `address ${address} must not be requested`).not.toHaveBeenCalled();
    }
  });

  it("still allows a public address", async () => {
    dnsAnswers.set("public.example", [{ address: "93.184.216.34", family: 4 }]);

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://public.example/")}`));

    expect(res.status).toBe(200);
  });
});

describe("the pinned transport", () => {
  it("connects to the VETTED address, not a freshly resolved one", async () => {
    dnsAnswers.set("pinned.example", [{ address: "93.184.216.34", family: 4 }]);

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://pinned.example/")}`));

    expect(res.status).toBe(200);
    await expect(invokePinnedLookup(0)).resolves.toEqual({
      address: "93.184.216.34",
      family: 4,
    });
  });

  it("never reaches for the ambient fetch", async () => {
    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("requests the url it was given", async () => {
    await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/page")}`));

    expect(requestedUrls()).toEqual(["https://target.example/page"]);
  });
});

describe("verdicts from response headers", () => {
  it("blocks on X-Frame-Options: DENY", async () => {
    queueHop({ status: 200, headers: { "x-frame-options": "DENY" } });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ embeddable: false, reason: "x-frame-options" });
  });

  it("blocks on X-Frame-Options: SAMEORIGIN, case-insensitively", async () => {
    queueHop({ status: 200, headers: { "x-frame-options": "sameorigin" } });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: false, reason: "x-frame-options" });
  });

  it("blocks on a REPEATED X-Frame-Options header", async () => {
    queueHop({ status: 200, headers: { "x-frame-options": ["DENY", "DENY"] } });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: false, reason: "x-frame-options" });
  });

  it("blocks on CSP frame-ancestors 'none'", async () => {
    queueHop({
      status: 200,
      headers: { "content-security-policy": "default-src 'self'; frame-ancestors 'none'" },
    });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({
      embeddable: false,
      reason: "csp-frame-ancestors",
    });
  });

  it("allows a frame-ancestors directive listing OUR origin", async () => {
    queueHop({
      status: 200,
      headers: { "content-security-policy": `frame-ancestors 'self' ${OUR_ORIGIN}` },
    });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
  });

  it("allows a frame-ancestors directive listing the REQUEST's own origin", async () => {
    queueHop({
      status: 200,
      headers: { "content-security-policy": "frame-ancestors http://localhost" },
    });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
  });

  it("allows a scheme-less frame-ancestors source equivalent to our host", async () => {
    // Host sources may carry no scheme; the port-bearing token must then
    // equal our origin's host exactly ("localhost:3000" in the default env).
    queueHop({
      status: 200,
      headers: { "content-security-policy": "frame-ancestors localhost:3000" },
    });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
  });

  it("allows the frame-ancestors wildcard", async () => {
    queueHop({
      status: 200,
      headers: { "content-security-policy": "frame-ancestors *" },
    });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
  });

  it("embeddable when no CSP carries a frame-ancestors directive", async () => {
    queueHop({ status: 200, headers: { "content-security-policy": "default-src 'none'" } });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
  });

  it("embeddable with no framing headers at all", async () => {
    queueHop({ status: 200 });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
  });

  it("blocks a frame-ancestors list naming someone else", async () => {
    queueHop({
      status: 200,
      headers: { "content-security-policy": "frame-ancestors 'self' https://other.example" },
    });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({
      embeddable: false,
      reason: "csp-frame-ancestors",
    });
  });

  it("blocks when ONE of two repeated CSP headers says 'none'", async () => {
    queueHop({
      status: 200,
      headers: {
        "content-security-policy": [`frame-ancestors ${OUR_ORIGIN}`, "frame-ancestors 'none'"],
      },
    });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({
      embeddable: false,
      reason: "csp-frame-ancestors",
    });
  });

  it("keeps a repeated CSP header's source list intact", async () => {
    queueHop({
      status: 200,
      headers: {
        "content-security-policy": ["default-src 'self'", `frame-ancestors ${OUR_ORIGIN}`],
      },
    });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
  });
});

describe("the 'us' comparison — host, port and wildcards", () => {
  it("treats a wildcard as SUBDOMAINS ONLY — never the apex", async () => {
    queueHop({
      status: 200,
      headers: { "content-security-policy": "frame-ancestors *.example.com" },
    });

    const res = await GET(
      makeRequest(
        `?url=${encodeURIComponent("https://target.example/")}`,
        "https://app.example.com",
      ),
    );

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
  });

  it("does not let a wildcard match the apex it names", async () => {
    queueHop({
      status: 200,
      headers: { "content-security-policy": "frame-ancestors *.app.example.com" },
    });

    const res = await GET(
      makeRequest(
        `?url=${encodeURIComponent("https://target.example/")}`,
        "https://app.example.com",
      ),
    );

    await expect(res.json()).resolves.toEqual({
      embeddable: false,
      reason: "csp-frame-ancestors",
    });
  });

  it("does not let a PORT-BEARING source match a portless origin", async () => {
    queueHop({
      status: 200,
      headers: { "content-security-policy": "frame-ancestors https://app.example.com:8443" },
    });

    const res = await GET(
      makeRequest(
        `?url=${encodeURIComponent("https://target.example/")}`,
        "https://app.example.com",
      ),
    );

    await expect(res.json()).resolves.toEqual({
      embeddable: false,
      reason: "csp-frame-ancestors",
    });
  });

  it("lets a port-bearing source match an origin on the same port", async () => {
    queueHop({
      status: 200,
      headers: { "content-security-policy": "frame-ancestors https://app.example.com:8443" },
    });

    const res = await GET(
      makeRequest(
        `?url=${encodeURIComponent("https://target.example/")}`,
        "https://app.example.com:8443",
      ),
    );

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
  });
});

describe("the HEAD-first probe", () => {
  it("falls back to GET when HEAD answers 405", async () => {
    queueHop({ status: 405 });
    queueHop({ status: 200 });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: true, reason: "ok" });
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(requested[0]?.options.method).toBe("HEAD");
    expect(requested[1]?.options.method).toBe("GET");
  });

  it("falls back to GET when HEAD answers 501", async () => {
    queueHop({ status: 501 });
    queueHop({ status: 200, headers: { "x-frame-options": "DENY" } });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    await expect(res.json()).resolves.toEqual({ embeddable: false, reason: "x-frame-options" });
    expect(requestMock).toHaveBeenCalledTimes(2);
  });
});

describe("the redirect walk — every hop is re-vetted", () => {
  it("follows a public redirect and judges the FINAL hop", async () => {
    queueHop({ status: 302, headers: { location: "https://final.example/landing" } });
    queueHop({ status: 200, headers: { "x-frame-options": "DENY" } });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ embeddable: false, reason: "x-frame-options" });
    expect(requestedUrls()).toEqual(["https://target.example/", "https://final.example/landing"]);
  });

  it("NEVER requests a hop that resolves to a private address", async () => {
    dnsAnswers.set("internal.example", [{ address: "127.0.0.1", family: 4 }]);
    queueHop({ status: 302, headers: { location: "https://internal.example/secret" } });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    expect(res.status).toBe(502);
    expect(await res.text()).toBe('{"error":"unreachable"}');
    expect(requestedUrls()).toEqual(["https://target.example/"]);
  });

  it("NEVER requests a hop that resolves to the cloud metadata address", async () => {
    dnsAnswers.set("meta.example", [{ address: "169.254.169.254", family: 4 }]);
    queueHop({ status: 302, headers: { location: "https://meta.example/latest/meta-data/" } });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    expect(res.status).toBe(502);
    expect(requestedUrls()).toEqual(["https://target.example/"]);
  });

  it("NEVER follows a redirect to a non-https url", async () => {
    queueHop({ status: 302, headers: { location: "http://final.example/landing" } });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    expect(res.status).toBe(502);
    expect(await res.text()).toBe('{"error":"unreachable"}');
    expect(requestedUrls()).toEqual(["https://target.example/"]);
  });

  it("follows at most 3 hops", async () => {
    queueHop({ status: 302, headers: { location: "https://hop1.example/" } });
    queueHop({ status: 302, headers: { location: "https://hop2.example/" } });
    queueHop({ status: 302, headers: { location: "https://hop3.example/" } });
    queueHop({ status: 200, headers: { "x-frame-options": "DENY" } });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ embeddable: false, reason: "x-frame-options" });
    expect(requestMock).toHaveBeenCalledTimes(4);
  });

  it("gives up on a FOURTH hop", async () => {
    queueHop({ status: 302, headers: { location: "https://hop1.example/" } });
    queueHop({ status: 302, headers: { location: "https://hop2.example/" } });
    queueHop({ status: 302, headers: { location: "https://hop3.example/" } });
    queueHop({ status: 302, headers: { location: "https://hop4.example/" } });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    expect(res.status).toBe(502);
    expect(requestMock).toHaveBeenCalledTimes(4);
    expect(requestedUrls()).not.toContain("https://hop4.example/");
  });
});

describe("unreachability — the 502 gate", () => {
  it("returns 502 when the upstream connection fails", async () => {
    queueHop({ fail: true });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    expect(res.status).toBe(502);
    expect(await res.text()).toBe('{"error":"unreachable"}');
  });

  it("returns 502 when the request times out", async () => {
    queueHop({ hang: true });

    const res = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));

    expect(res.status).toBe(502);
    expect(await res.text()).toBe('{"error":"unreachable"}');
  });
});

describe("the verdict cache (6h, cap 32)", () => {
  it("serves a repeat verdict without a second upstream probe", async () => {
    queueHop({ status: 200 });
    queueHop({ status: 200 });

    const first = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));
    expect(requestMock).toHaveBeenCalledTimes(1);

    const second = await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/")}`));
    await expect(second.json()).resolves.toEqual(await first.json());
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("shares one cache entry across query-string variants of the same path", async () => {
    queueHop({ status: 200 });
    queueHop({ status: 200 });

    await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/page?utm=a")}`));
    await GET(makeRequest(`?url=${encodeURIComponent("https://target.example/page?utm=b")}`));

    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("evicts the OLDEST insertion at the cap, not the most recent", async () => {
    const paths = Array.from({ length: 33 }, (_, index) => `https://target.example/repo-${index}`);

    for (const path of paths) {
      await GET(makeRequest(`?url=${encodeURIComponent(path)}`));
    }
    expect(requestMock).toHaveBeenCalledTimes(33);

    // The FIRST verdict was evicted — re-probing it costs an upstream call.
    await GET(makeRequest(`?url=${encodeURIComponent(paths[0]!)}`));
    expect(requestMock).toHaveBeenCalledTimes(34);

    // The LAST verdict is still cached — no new probe.
    await GET(makeRequest(`?url=${encodeURIComponent(paths[32]!)}`));
    expect(requestMock).toHaveBeenCalledTimes(34);
  });

  it("starts from a clean slate after a cache reset", async () => {
    queueHop({ status: 200 });
    queueHop({ status: 200 });
    const path = `?url=${encodeURIComponent("https://target.example/repo-0")}`;

    await GET(makeRequest(path));
    expect(requestMock).toHaveBeenCalledTimes(1);

    resetEmbedCheckCache();

    await GET(makeRequest(path));
    expect(requestMock).toHaveBeenCalledTimes(2);
  });
});

describe("the failure cache (60s) — an unauthenticated amplifier, closed", () => {
  it("serves a repeated private-host refusal without a second DNS lookup", async () => {
    dnsAnswers.set("internal.example", [{ address: "127.0.0.1", family: 4 }]);
    const query = `?url=${encodeURIComponent("https://internal.example/")}`;

    const first = await GET(makeRequest(query));
    expect(first.status).toBe(400);
    expect(lookupMock).toHaveBeenCalledTimes(1);

    const second = await GET(makeRequest(query));
    expect(second.status).toBe(400);
    await expect(second.json()).resolves.toEqual({ error: "invalid url" });
    expect(lookupMock).toHaveBeenCalledTimes(1);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("serves a repeated unreachable answer without a second upstream probe", async () => {
    queueHop({ fail: true });
    queueHop({ fail: true });
    const query = `?url=${encodeURIComponent("https://target.example/")}`;

    const first = await GET(makeRequest(query));
    expect(first.status).toBe(502);

    const second = await GET(makeRequest(query));
    expect(second.status).toBe(502);
    await expect(second.json()).resolves.toEqual({ error: "unreachable" });
    expect(requestMock).toHaveBeenCalledTimes(1);
  });
});
