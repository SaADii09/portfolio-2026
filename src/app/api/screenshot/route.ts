import { isScreenshotAllowed } from "@/lib/screenshot-allowlist";
import sharp from "sharp";

// The two-clause gate lives in src/lib/screenshot-allowlist.ts: https plus
// an origin from the allow set (the project repo/demo origins, the curated
// tile origins and github.com — github.com stays eligible, Review Focus 5).
// The route keeps its historical export name so existing callers and tests
// stay stable.
export function isAllowedUrl(url: string): boolean {
  return isScreenshotAllowed(url);
}

/**
 * In-memory TTL cache for screenshot bytes (cap 32, 6h TTL). Microlink's
 * free tier is tightly rate-limited and each capture is slow + heavy — the
 * fallback panel needs a small card-sized view, not a fresh full-res capture
 * per visitor. Entries evict on insert: expired first, then the OLDEST by
 * insertion order, so the map stays bounded.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — screenshots are rarely stale
const CACHE_MAX = 32;

/** The server-side resize bounds — the capture is fitted INSIDE 1280×720. */
const SLICE_WIDTH = 1280;
const SLICE_HEIGHT = 720;
const SLICE_QUALITY = 70;
const screenshotCache = new Map<string, { bytes: ArrayBuffer; contentType: string; at: number }>();

/** Expired entries go first (value sweep); the oldest follows. */
function evictExpiredEntries(): void {
  for (const [key, value] of screenshotCache) {
    if (Date.now() - value.at > CACHE_TTL_MS) screenshotCache.delete(key);
  }
}

function cachePut(url: string, entry: { bytes: ArrayBuffer; contentType: string }): void {
  evictExpiredEntries();
  // Bound the map: drop oldest (insertion order) until the new entry fits.
  while (screenshotCache.size >= CACHE_MAX) {
    const oldest = screenshotCache.keys().next().value;
    if (oldest === undefined) break;
    screenshotCache.delete(oldest);
  }
  screenshotCache.set(url, { ...entry, at: Date.now() });
}

/**
 * Cache key: origin + pathname (query/hash dropped). The route is public and
 * unauthenticated, so a `?utm=…` variant of an allow-listed page must share
 * ONE cache entry instead of triggering a fresh Microlink capture.
 */
function cacheKeyFor(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

/**
 * Test plumbing: vitest shares the module instance across a file's tests.
 * @expected-unused -- reset consumed only by test files (cache isolation)
 */
export function resetScreenshotCache(): void {
  screenshotCache.clear();
}

/** 200 response shape shared by the cache hit and the fresh capture path. */
function jpegResponse(bytes: ArrayBuffer, contentType: string): Response {
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}

function cachedResponse(url: string): Response | undefined {
  const cached = screenshotCache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return jpegResponse(cached.bytes, cached.contentType);
  }
  return undefined;
}

/**
 * Outbound Microlink capture: resolve the serve URL from JSON, fetch the
 * image bytes, and throw on every failure shape so GET's catch renders 502.
 */
async function captureMicrolink(url: string): Promise<Buffer> {
  const res = await fetch(
    `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false`,
  );
  if (!res.ok) throw new Error("Screenshot failed");

  // json() is runtime-untyped; the typeof guard below is the sole validator —
  // a payload missing any level degrades to `undefined` and rejects via 502.
  const { data: { screenshot: { url: screenshotUrl } = {} } = {} } = (await res.json()) as {
    data?: { screenshot?: { url?: unknown } };
  };
  if (typeof screenshotUrl !== "string") throw new Error("No screenshot url");

  const image = await fetch(screenshotUrl);
  if (!image.ok) throw new Error("Screenshot bytes fetch failed");

  // Read the bytes once, resize, and cache the compressed result. Reading
  // through Response(stream) keeps plain {ok, body}-shaped mock responses —
  // as the unit tests build — on the same path.
  return Buffer.from(await new Response(image.body).arrayBuffer());
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url || !isAllowedUrl(url)) {
    return Response.json({ error: "Invalid url" }, { status: 400 });
  }

  // The cache keys on origin + pathname; the capture still uses the full url.
  const cacheKey = cacheKeyFor(url);

  const cached = cachedResponse(cacheKey);
  if (cached) return cached;

  try {
    // Microlink's free tier serves only its default capture (advanced capture
    // params are paid-plan gated and silently ignored), so the resize happens
    // here: the fallback panel displays this at a fraction of desktop width,
    // and the raw capture is a ~550KB 2560×1600 PNG — ~10× heavier than the
    // card view needs.
    const raw = await captureMicrolink(url);
    const jpeg = await sharp(raw)
      .resize(SLICE_WIDTH, SLICE_HEIGHT, { fit: "inside" })
      .jpeg({ quality: SLICE_QUALITY })
      .toBuffer();
    const bytes = new Uint8Array(jpeg).buffer;
    cachePut(cacheKey, { bytes, contentType: "image/jpeg" });
    return jpegResponse(bytes, "image/jpeg");
  } catch {
    // Error bodies never echo internal state (requested url, upstream URLs).
    return Response.json({ error: "screenshot unavailable" }, { status: 502 });
  }
}
