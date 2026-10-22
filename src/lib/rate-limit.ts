/**
 * A per-IP rate limiter for the public API routes.
 *
 * Both unauthenticated routes that reach the network use this: `/api/chat`
 * (an LLM call) and `/api/embed-check` (an outbound HTTPS probe). The
 * limiter is a module-scope in-memory map — the same posture as the route
 * caches: per-instance, best effort, and it dies with the process.
 *
 * The rule the repo documents is "rate limit API routes per IP" (see
 * `docs/Rules.md`), and the response is a fixed 429 body that never echoes
 * anything about the caller.
 */

/** The caller's address: the left-most `x-forwarded-for` entry, else the socket peer. */
export function clientIpOf(request: Request): string {
  const headers = request.headers;
  return (
    headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers?.get("x-real-ip") ??
    "127.0.0.1"
  );
}

/** Drops the stamps that fell out of the window. */
export function pruneTimestamps(stamps: number[], now: number, windowMs: number): number[] {
  return stamps.filter((t) => now - t < windowMs);
}

export interface RateLimiterOptions {
  /** How many requests one address may make inside the window. */
  readonly limit: number;
  /** The window's length in milliseconds. */
  readonly windowMs: number;
}

export interface RateLimiter {
  /** True when this request must be refused. */
  isLimited(ip: string): boolean;
  /** Drops the map's empty entries (a periodic tidy, not a correctness need). */
  prune(): void;
  /** Forgets every recorded address (test isolation). */
  reset(): void;
}

/**
 * A sliding-window limiter. The stamps are pruned on every check, so an
 * address that stops calling ages out of the map on its next visit.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { limit, windowMs } = options;
  const requestLog = new Map<string, number[]>();

  const isLimited = (ip: string): boolean => {
    const now = Date.now();
    const pruned = pruneTimestamps(requestLog.get(ip) ?? [], now, windowMs);
    if (pruned.length === 0) {
      requestLog.delete(ip);
    }
    if (pruned.length >= limit) {
      return true;
    }
    requestLog.set(ip, [...pruned, now]);
    return false;
  };

  const prune = (): void => {
    const now = Date.now();
    for (const [ip, stamps] of requestLog) {
      const kept = pruneTimestamps(stamps, now, windowMs);
      if (kept.length === 0) requestLog.delete(ip);
      else requestLog.set(ip, kept);
    }
  };

  return { isLimited, prune, reset: () => requestLog.clear() };
}

/** The fixed 429 body — it never echoes anything about the caller. */
export function rateLimitedResponse(): Response {
  return Response.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
}
