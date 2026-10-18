import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { GET, parseCoords } from "@/app/api/weather/route";

// Current hardcoded defaults from route.ts — keep verbatim.
const DEFAULT_LAT = "30.18";
const DEFAULT_LON = "71.55";
const DEFAULT_URL = `https://api.open-meteo.com/v1/forecast?latitude=${DEFAULT_LAT}&longitude=${DEFAULT_LON}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto`;

function makeRequest(search: string): Request {
  return { url: `http://localhost/api/weather${search}` } as unknown as Request;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockClear();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ current: {} }) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function outboundUrl(): string {
  return fetchMock.mock.calls[0]?.[0] as string;
}

function outboundInit(): { next?: { revalidate?: number } } | undefined {
  return fetchMock.mock.calls[0]?.[1] as { next?: { revalidate?: number } } | undefined;
}

describe("parseCoords", () => {
  it("returns the built-in defaults when params are absent", () => {
    expect(parseCoords(new URLSearchParams(""))).toEqual({
      lat: Number(DEFAULT_LAT),
      lon: Number(DEFAULT_LON),
    });
  });

  it("keeps a valid negative decimal coordinate", () => {
    expect(parseCoords(new URLSearchParams("lat=-12.5&lon=-7.25"))).toEqual({ lat: -12.5, lon: -7.25 });
  });

  it("falls back for empty-string params (empty is present but invalid)", () => {
    expect(parseCoords(new URLSearchParams("lat=&lon="))).toEqual({
      lat: Number(DEFAULT_LAT),
      lon: Number(DEFAULT_LON),
    });
  });

  it("does not partially parse `12abc` (previously interpolated as-is)", () => {
    expect(parseCoords(new URLSearchParams("lat=12abc")).lat).not.toBe(12);
    expect(parseCoords(new URLSearchParams("lat=12abc")).lat).toBe(Number(DEFAULT_LAT));
  });

  it("falls back for other invalid values", () => {
    const fallsBack = (lat: string) => parseCoords(new URLSearchParams(`lat=${lat}`)).lat;
    expect(fallsBack("1.2.3")).toBe(Number(DEFAULT_LAT));
    expect(fallsBack("abc")).toBe(Number(DEFAULT_LAT));
    expect(fallsBack("30.1234567")).toBe(Number(DEFAULT_LAT));
  });
});

describe("GET route", () => {
  it("passes only validated values into the outbound URL (junk never reaches it)", async () => {
    await GET(makeRequest("?lat=30&lon=71.44&junk=x&scale=zap"));

    const url = outboundUrl();
    expect(url).toContain("latitude=30&longitude=71.44");
    expect(url).not.toContain("junk");
    expect(url).not.toContain("scale");
  });

  it("falls back to defaults for an invalid lat", async () => {
    await GET(makeRequest("?lat=abc"));

    expect(outboundUrl()).toBe(DEFAULT_URL);
  });

  it("feeds `lat=12abc` through the anchored regex back to defaults", async () => {
    await GET(makeRequest("?lat=12abc"));

    expect(outboundUrl()).toContain(`latitude=${DEFAULT_LAT}`);
  });

  it("keeps a valid negative decimal lat", async () => {
    await GET(makeRequest("?lat=-12.5"));

    expect(outboundUrl()).toContain("latitude=-12.5");
  });

  it("caches the upstream response via the fetch request-init, revalidate=900", async () => {
    await GET(makeRequest("?lat=30"));

    // An `export const revalidate` on this dynamic route would be a silent
    // no-op; the cache lives on the outbound fetch init.
    expect(outboundInit()).toEqual({ next: { revalidate: 900 } });
  });

  it("proxies the upstream payload through unchanged", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ current: { temperature_2m: 21.5 } }),
    });

    const res = await GET(makeRequest(""));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ current: { temperature_2m: 21.5 } });
  });
});
