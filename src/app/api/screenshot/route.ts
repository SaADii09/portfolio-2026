import { PROJECTS } from "@/lib/portfolio-data";
import sharp from "sharp";

// Allow-list derives from the projects data (PROJECTS[].url) at module scope,
// so editing portfolio links updates this route without touching it here.
export const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(
  PROJECTS.flatMap((project) => {
    try {
      return [new URL(project.url).origin];
    } catch {
      return [];
    }
  }),
);

// Two-clause pure check: https protocol + allow-listed origin.
export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_ORIGINS.has(parsed.origin);
  } catch {
    return false;
  }
}

/**
 * In-memory TTL cache for screenshot bytes. Microlink's free tier is tightly
 * rate-limited and each capture is slow + heavy — the fallback panel needs a
 * small :card:-sized view, not a fresh full-res capture per visitor. Entries
 * evict lazily (leader sweep on insert) to keep the map bounded.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — screenshots are rarely stale
const CACHE_MAX = 32;

/** Microlink serve-size floor card captures; a preview panel needs less. */
const SLICE_WIDTH = 1280;
const SLICE_HEIGHT = 720;
const SLICE_QUALITY = 70;
const screenshotCache = new Map<string, { bytes: ArrayBuffer; contentType: string; at: number }>();

function cachePut(url: string, entry: { bytes: ArrayBuffer; contentType: string }): void {
  // Bound the map: drop expired entries first, then oldest (insertion order)
  // until the new entry fits under the cap.
  for (const [key, value] of screenshotCache) {
    if (Date.now() - value.at > CACHE_TTL_MS) screenshotCache.delete(key);
  }
  while (screenshotCache.size >= CACHE_MAX) {
    const oldest = screenshotCache.keys().next().value;
    if (oldest === undefined) break;
    screenshotCache.delete(oldest);
  }
  screenshotCache.set(url, { ...entry, at: Date.now() });
}

/** Test plumbing: vitest shares the module instance across a file's tests. */
export function resetScreenshotCache(): void {
  screenshotCache.clear();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url || !isAllowedUrl(url)) {
    return Response.json({ error: "Invalid url" }, { status: 400 });
  }

  const cached = screenshotCache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return new Response(cached.bytes, {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  try {
    // Microlink's free tier serves only its default capture (advanced capture
    // params are paid-plan gated and silently ignored), so the resize happens
    // here: the fallback panel displays this at a fraction of desktop width,
    // and the raw capture is a ~550KB 2560×1600 PNG — ~10× heavier than the
    // card view needs.
    const res = await fetch(
      `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false`,
    );

    if (!res.ok) throw new Error("Screenshot failed");

    const data = await res.json();
    const screenshotUrl: unknown = data?.data?.screenshot?.url;
    if (typeof screenshotUrl !== "string") throw new Error("No screenshot url");

    const image = await fetch(screenshotUrl);
    if (!image.ok) throw new Error("Screenshot bytes fetch failed");

    // Read the bytes once, resize, and cache the compressed result. Reading
    // through Response(stream) keeps plain {ok, body}-shaped mock responses —
    // as the unit tests build — on the same path.
    const raw = Buffer.from(await new Response(image.body).arrayBuffer());
    const jpeg = await sharp(raw)
      .resize(SLICE_WIDTH, SLICE_HEIGHT, { fit: "inside" })
      .jpeg({ quality: SLICE_QUALITY })
      .toBuffer();
    const bytes = new Uint8Array(jpeg).buffer;
    const contentType = "image/jpeg";
    cachePut(url, { bytes, contentType });

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    // Error bodies never echo internal state (requested url, upstream URLs).
    return Response.json({ error: "screenshot unavailable" }, { status: 502 });
  }
}
