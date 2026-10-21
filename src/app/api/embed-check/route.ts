import { lookup } from "node:dns/promises";
import { siteUrl } from "@/lib/site";

// Interface pinned by Task A1 (embed verdict route):
//   GET /api/embed-check?url=<https-url>
//     → 200 { embeddable: boolean, reason: "ok" | "x-frame-options" | "csp-frame-ancestors" }
//     → 400 {"error":"invalid url"} — non-https / unparsable / private DNS (never fetched)
//     → 502 {"error":"unreachable"} — timeout, network error, or a redirect chain
//       whose FINAL response.url is not https
// Headers only: the response body is never read or retained.

/**
 * In-memory TTL cache for framing verdicts (cap 32, 6h TTL), mirroring the
 * screenshot route's Map idiom: entries evict on insert — expired first, then
 * the OLDEST by insertion order. Verdicts are per origin+pathname, so a
 * `?utm=…` variant shares one entry instead of re-probing upstream.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — framing headers rarely change
const CACHE_MAX = 32;
/** Deadline for each outbound probe (HEAD and GET alike). */
const TIMEOUT_MS = 5000;

/**
 * Our own origin — a frame-ancestors list naming it (or an equivalent host
 * token, or `'self'` while framing us) allows the embed.
 */
const OUR_ORIGIN = new URL(siteUrl).origin;
const OUR_HOST = new URL(siteUrl).host;
const OUR_HOSTNAME = new URL(siteUrl).hostname;

export interface EmbedVerdict {
  embeddable: boolean;
  reason: "ok" | "x-frame-options" | "csp-frame-ancestors";
}

const OK_VERDICT: EmbedVerdict = { embeddable: true, reason: "ok" };
const XFO_BLOCKED: EmbedVerdict = { embeddable: false, reason: "x-frame-options" };
const CSP_BLOCKED: EmbedVerdict = { embeddable: false, reason: "csp-frame-ancestors" };

const verdictCache = new Map<string, { verdict: EmbedVerdict; at: number }>();

/** Expired entries go first; the oldest follows. */
function evictExpiredEntries(): void {
  for (const [key, value] of verdictCache) {
    if (Date.now() - value.at > CACHE_TTL_MS) verdictCache.delete(key);
  }
}

function cachePut(key: string, verdict: EmbedVerdict): void {
  evictExpiredEntries();
  while (verdictCache.size >= CACHE_MAX) {
    const oldest = verdictCache.keys().next().value;
    if (oldest === undefined) break;
    verdictCache.delete(oldest);
  }
  verdictCache.set(key, { verdict, at: Date.now() });
}

function cachedVerdict(key: string): EmbedVerdict | null {
  const cached = verdictCache.get(key);
  if (cached === undefined) return null;
  return Date.now() - cached.at < CACHE_TTL_MS ? cached.verdict : null;
}

function cacheKeyFor(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

/**
 * Test plumbing: vitest shares the module instance across a file's tests.
 * @expected-unused -- reset consumed only by test files (cache isolation)
 */
export function resetEmbedCheckCache(): void {
  verdictCache.clear();
}

// ---------------------------------------------------------------------------
// SSRF guards — the url gate runs BEFORE any outbound traffic (scheme, then a
// literal-IP check, then DNS; fail-closed on every step).
// ---------------------------------------------------------------------------

function parseHttpsUrl(raw: string | null): URL | null {
  if (raw === null) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** IPv6 literals arrive bracketed in URL.hostname. */
function unbracketHost(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function octetOf(part: string): number | null {
  if (!/^\d{1,3}$/.test(part)) return null;
  const value = Number(part);
  return value > 255 ? null : value;
}

/** 10/8, 172.16/12, 192.168/16, 169.254/16 — and everything in 0/8. */
const PRIVATE_FIRST_OCTET = new Set([0, 10, 127]);
const SPECIAL_RANGES: ReadonlyArray<readonly [number, number, number]> = [
  [169, 254, 254], // link-local
  [172, 16, 31], // private
  [192, 168, 168], // private
];

function parseDottedQuad(addr: string): { a: number; b: number } | null {
  const parts = addr.split(".");
  const values = parts.map(octetOf);
  if (parts.length !== 4 || values.includes(null)) return null;
  const [a, b] = values as [number, number, number, number];
  return { a, b };
}

function isForbiddenIpv4(addr: string): boolean {
  const quad = parseDottedQuad(addr);
  if (quad === null) return false;
  if (PRIVATE_FIRST_OCTET.has(quad.a)) return true;
  return SPECIAL_RANGES.some(
    ([first, low, high]) => first === quad.a && low <= quad.b && quad.b <= high,
  );
}

/** fc00::/7 → `fc`/`fd`; fe80::/10 → `fe8…feb`. */
function isForbiddenIpv6(addr: string): boolean {
  const norm = addr.toLowerCase();
  // IPv4-mapped forms inherit the v4 ruling.
  if (norm.startsWith("::ffff:")) return isForbiddenIpv4(norm.slice("::ffff:".length));
  if (norm === "::" || norm === "::1") return true;
  return /^(?:f[cd]|fe[89ab])/.test(norm);
}

function isForbiddenAddress(addr: string): boolean {
  if (addr.includes(":")) return isForbiddenIpv6(addr);
  return isForbiddenIpv4(addr);
}

/** Resolves EVERY record and requires all of them to be public; fails closed. */
async function hostIsPublic(url: URL): Promise<boolean> {
  const host = unbracketHost(url.hostname);
  if (isForbiddenAddress(host)) return false;
  try {
    const records = await lookup(host, { all: true });
    return records.every((record) => !isForbiddenAddress(record.address));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The HEAD-first probe. `redirect: "follow"` — Node/undici's `redirect:
// "manual"` yields an opaque unreadable response, so the scheme is validated
// on the FINAL response.url instead of Location reads. The body is never read.
// ---------------------------------------------------------------------------

async function timedFetch(url: string, method: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { method, redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeHeaders(url: string): Promise<Response | null> {
  try {
    const head = await timedFetch(url, "HEAD");
    if (head.status === 405 || head.status === 501) return timedFetch(url, "GET");
    return head;
  } catch {
    return null;
  }
}

function finalUrlIsHttps(response: Response): boolean {
  try {
    return new URL(response.url).protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Verdict evaluation from the final response's headers.
// ---------------------------------------------------------------------------

function isDenyingXfo(value: string): boolean {
  const upper = value.toUpperCase();
  return upper.includes("DENY") || upper.includes("SAMEORIGIN");
}

/** The `frame-ancestors` sources, or null when the directive is absent. */
function frameAncestorsSources(csp: string): string[] | null {
  // Directive separators in practice: ";" between directives — but multiple
  // CSP headers arrive comma-combined through Headers.get, so both split.
  for (const directive of csp.split(/[;,]/)) {
    const tokens = directive.trim().split(/\s+/).filter(Boolean);
    if (tokens[0]?.toLowerCase() === "frame-ancestors") return tokens.slice(1);
  }
  return null;
}

function hostishAllowsUs(source: string): boolean {
  // Drop scheme (if any), wildcard labels, paths and ports, then compare
  // against our host (with port) or bare hostname.
  const hostish = source
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^\*\./, "")
    .split("/")[0]
    ?.split(":")[0];
  return hostish === OUR_HOST || hostish === OUR_HOSTNAME || hostish === OUR_ORIGIN.split("//")[1];
}

function sourceAllowsUs(source: string, requestIsOurs: boolean): boolean {
  const src = source.trim().toLowerCase();
  if (src === "*") return true;
  if (src === "'self'") return requestIsOurs;
  if (src === OUR_ORIGIN) return true;
  return hostishAllowsUs(src);
}

const NONE_SOURCES = new Set(["'none'", "none"]);

function isNoneSource(source: string): boolean {
  return NONE_SOURCES.has(source.toLowerCase());
}

function cspVerdict(csp: string | null, requestIsOurs: boolean): EmbedVerdict {
  if (csp === null) return OK_VERDICT;
  const sources = frameAncestorsSources(csp);
  return ancestorsVerdict(sources, requestIsOurs);
}

function ancestorsVerdict(sources: string[] | null, requestIsOurs: boolean): EmbedVerdict {
  if (sources === null) return OK_VERDICT;
  if (sources.some(isNoneSource)) return CSP_BLOCKED;
  if (sources.some((source) => sourceAllowsUs(source, requestIsOurs))) return OK_VERDICT;
  return CSP_BLOCKED;
}

function requestIsOurs(response: Response): boolean {
  try {
    return new URL(response.url).origin === OUR_ORIGIN;
  } catch {
    return false;
  }
}

function evaluateFraming(response: Response): EmbedVerdict {
  const xfo = response.headers.get("x-frame-options");
  if (xfo !== null && isDenyingXfo(xfo)) return XFO_BLOCKED;
  return cspVerdict(response.headers.get("content-security-policy"), requestIsOurs(response));
}

// Fixed bodies never echo the requested url or upstream state.
const INVALID_BODY = { error: "invalid url" };
const UNREACHABLE_BODY = { error: "unreachable" };

function invalidUrl(): Response {
  return Response.json(INVALID_BODY, { status: 400 });
}

function unreachable(): Response {
  return Response.json(UNREACHABLE_BODY, { status: 502 });
}

async function verdictResponse(url: URL): Promise<Response> {
  const key = cacheKeyFor(url);
  const cached = cachedVerdict(key);
  if (cached !== null) return Response.json(cached);

  const response = await probeHeaders(url.toString());
  if (response === null || !finalUrlIsHttps(response)) return unreachable();

  const verdict = evaluateFraming(response);
  cachePut(key, verdict);
  return Response.json(verdict);
}

export async function GET(request: Request): Promise<Response> {
  const url = parseHttpsUrl(new URL(request.url).searchParams.get("url"));
  if (url === null) return invalidUrl();
  if (!(await hostIsPublic(url))) return invalidUrl();
  return verdictResponse(url);
}
