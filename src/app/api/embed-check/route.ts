import { lookup } from "node:dns/promises";
import type { IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";

import { clientIpOf, createRateLimiter, rateLimitedResponse } from "@/lib/rate-limit";

// Interface pinned by Task A1 (embed verdict route):
//   GET /api/embed-check?url=<https-url>
//     → 200 { embeddable: boolean, reason: "ok" | "x-frame-options" | "csp-frame-ancestors" }
//     → 400 {"error":"invalid url"} — non-https / unparsable / private DNS (never fetched)
//     → 429 {"error":"Rate limit exceeded. Try again in a minute."} — per-IP limit
//     → 502 {"error":"unreachable"} — timeout, network error, or a redirect hop
//       that fails re-validation
// Headers only: the response body is never read or retained.
//
// The verdict answers "may the EMBEDDER (the origin that called this route)
// frame the target?" — so `frame-ancestors` is judged against the embedder:
// 'self' requires the embedder to share the TARGET's origin, and every
// other source must equal the embedder's origin.
//
// The outbound leg is `node:https`, NEVER the ambient `fetch`: the vetted
// address is PINNED into the connection through a custom `lookup`, so the
// socket cannot be re-resolved to a private address between the check and the
// connect (the DNS-rebinding TOCTOU), and the redirect chain is walked by
// hand so every hop is re-vetted before it is requested.

/**
 * In-memory TTL cache for framing verdicts (cap 32, 6h TTL), mirroring the
 * screenshot route's Map idiom: entries evict on insert — expired first, then
 * the OLDEST by insertion order. Verdicts are per origin+pathname, so a
 * `?utm=…` variant shares one entry instead of re-probing upstream.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — framing headers rarely change
/**
 * The failure cache (60s) closes the unauthenticated outbound-request
 * amplifier: a repeated bad url costs NOTHING (no DNS lookup, no upstream
 * request) inside the short TTL. Same rationale as the project-meta route's
 * negative cache — a failure must recover fast, but it must not be free to
 * repeat.
 */
const FAILURE_TTL_MS = 60 * 1000; // 60s — a failure must recover fast
const CACHE_MAX = 32;
/**
 * Per-IP rate limit (the repo rule: "rate limit API routes per IP"). The
 * route makes an unauthenticated outbound request per call, so without this
 * a caller could turn it into an amplifier. 30/min is generous for a
 * visitor opening sites and tight for an amplifier.
 */
const MAX_REQUESTS_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

const limiter = createRateLimiter({
  limit: MAX_REQUESTS_PER_MINUTE,
  windowMs: RATE_LIMIT_WINDOW_MS,
});

/**
 * Test plumbing: vitest shares the module instance across a file's tests, so
 * the per-IP counter would otherwise leak between them.
 * @expected-unused -- reset consumed only by test files (limiter isolation)
 */
export function resetEmbedCheckLimiter(): void {
  limiter.reset();
}

/** Deadline for each outbound probe (HEAD and GET alike). */
const TIMEOUT_MS = 5000;
/** The redirect chain is walked by hand — at most 3 hops past the first. */
const MAX_REDIRECTS = 3;
/**
 * The OVERALL deadline for one verdict. A chain is up to 4 hops and each hop
 * may cost HEAD + a GET fallback, so the per-request timeout alone allowed a
 * ~40s request — a single unauthenticated call holding eight sockets open.
 * The whole walk is therefore bounded, and the outstanding request is
 * destroyed when the budget runs out.
 */
const WALK_DEADLINE_MS = 10000;
const USER_AGENT = "DevOS-EmbedCheck/1.0";

export interface EmbedVerdict {
  embeddable: boolean;
  reason: "ok" | "x-frame-options" | "csp-frame-ancestors";
}

const OK_VERDICT: EmbedVerdict = { embeddable: true, reason: "ok" };
const XFO_BLOCKED: EmbedVerdict = { embeddable: false, reason: "x-frame-options" };
const CSP_BLOCKED: EmbedVerdict = { embeddable: false, reason: "csp-frame-ancestors" };

/** A cache entry with its own TTL — the verdict and the failure differ. */
interface CacheEntry {
  at: number;
  ttlMs: number;
}

/** Which fixed answer a cached failure replays. */
type FailureKind = "invalid" | "unreachable";

const verdictCache = new Map<string, CacheEntry & { verdict: EmbedVerdict }>();
const failureCache = new Map<string, CacheEntry & { kind: FailureKind }>();

/** Drop the entries whose own TTL has expired. */
function evictExpiredEntries<V extends CacheEntry>(cache: Map<string, V>): void {
  const now = Date.now();
  for (const [key, value] of cache) {
    if (now - value.at > value.ttlMs) cache.delete(key);
  }
}

/** Drop the OLDEST entries (insertion order) until the map fits under the cap. */
function evictOldestEntries<V extends CacheEntry>(cache: Map<string, V>, max: number): void {
  const keys = [...cache.keys()];
  const excess = Math.max(0, keys.length - (max - 1));
  for (const key of keys.slice(0, excess)) {
    cache.delete(key);
  }
}

function cachedVerdict(key: string): EmbedVerdict | null {
  const cached = verdictCache.get(key);
  if (cached === undefined) return null;
  return Date.now() - cached.at < cached.ttlMs ? cached.verdict : null;
}

function cachedFailure(key: string): FailureKind | null {
  const cached = failureCache.get(key);
  if (cached === undefined) return null;
  return Date.now() - cached.at < cached.ttlMs ? cached.kind : null;
}

function verdictCachePut(key: string, verdict: EmbedVerdict): void {
  evictExpiredEntries(verdictCache);
  evictOldestEntries(verdictCache, CACHE_MAX);
  verdictCache.set(key, { verdict, at: Date.now(), ttlMs: CACHE_TTL_MS });
  failureCache.delete(key);
}

function failureCachePut(key: string, kind: FailureKind): void {
  evictExpiredEntries(failureCache);
  evictOldestEntries(failureCache, CACHE_MAX);
  failureCache.set(key, { kind, at: Date.now(), ttlMs: FAILURE_TTL_MS });
  verdictCache.delete(key);
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
  failureCache.clear();
}

// ---------------------------------------------------------------------------
// SSRF guards — the url gate runs BEFORE any outbound traffic (scheme, then a
// literal-IP check, then DNS; fail-closed on every step).
//
// Every address is NORMALIZED before it is judged. The WHATWG URL parser
// rewrites an IPv4-mapped literal to HEX ("[::ffff:127.0.0.1]" →
// "[::ffff:7f00:1]") and dns.lookup answers in that same hex form, so a
// dotted-quad-only check would wave loopback (and the cloud metadata address)
// straight through to the target.
// ---------------------------------------------------------------------------

/** Only an https url is ever probed — the scheme gate runs first. */
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

/** A dotted-quad octet, or null when the part is not one. */
function octetOf(part: string): number | null {
  if (!/^\d{1,3}$/.test(part)) return null;
  const value = Number(part);
  return value > 255 ? null : value;
}

/** The 4 octets of a dotted quad, or null when the text is not one. */
interface Quad {
  a: number;
  b: number;
  c: number;
  d: number;
}

function parseDottedQuad(addr: string): Quad | null {
  const parts = addr.split(".");
  if (parts.length !== 4) return null;
  const values = parts.map(octetOf);
  if (values.includes(null)) return null;
  const [a, b, c, d] = values as [number, number, number, number];
  return { a, b, c, d };
}

/**
 * The IPv4 blocks that must never be reached: 0/8, 10/8, 100.64/10 (CGNAT —
 * 100.100.100.200 lives there), 127/8, 169.254/16 (cloud metadata),
 * 172.16/12, 192.168/16, 198.18/15, 224/4 (multicast) and 240/4 (reserved,
 * including 255.255.255.255). Each entry is [first-octet low, first-octet
 * high, second-octet low, second-octet high].
 */
const FORBIDDEN_V4_BLOCKS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 0, 255],
  [10, 10, 0, 255],
  [100, 100, 64, 127],
  [127, 127, 0, 255],
  [169, 169, 254, 254],
  [172, 172, 16, 31],
  [192, 192, 168, 168],
  [198, 198, 18, 19],
  [224, 239, 0, 255],
  [240, 255, 0, 255],
];

function matchesBlock(
  quad: Quad,
  firstLow: number,
  firstHigh: number,
  secondLow: number,
  secondHigh: number,
): boolean {
  return quad.a >= firstLow && quad.a <= firstHigh && quad.b >= secondLow && quad.b <= secondHigh;
}

/** 192.0.0.0/24 — the IETF protocol-assignment block. */
function isProtocolAssignmentBlock(quad: Quad): boolean {
  return quad.a === 192 && quad.b === 0 && quad.c === 0;
}

function isForbiddenIpv4(addr: string): boolean {
  const quad = parseDottedQuad(addr);
  if (quad === null) return false;
  if (isProtocolAssignmentBlock(quad)) return true;
  return FORBIDDEN_V4_BLOCKS.some(([firstLow, firstHigh, secondLow, secondHigh]) =>
    matchesBlock(quad, firstLow, firstHigh, secondLow, secondHigh),
  );
}

/** A dotted-quad tail inside an IPv6 literal ("::ffff:127.0.0.1" → hex). */
function dottedTailToHex(addr: string): string | null {
  if (!addr.includes(".")) return addr;
  const parts = addr.split(":");
  const tail = parts.pop();
  if (tail === undefined) return null;
  const quad = parseDottedQuad(tail);
  if (quad === null) return null;
  const hi = ((quad.a << 8) | quad.b).toString(16);
  const lo = ((quad.c << 8) | quad.d).toString(16);
  return [...parts, `${hi}:${lo}`].join(":");
}

function splitGroups(part: string | undefined): string[] {
  return part === undefined || part === "" ? [] : part.split(":");
}

/** A hex group's value, or null when it is not 1–4 hex digits. */
function hexGroup(part: string): number | null {
  if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
  return Number.parseInt(part, 16);
}

/** The compressed "::" must stand for at least one group; a plain form for none. */
function validGap(compressed: boolean, gap: number): boolean {
  if (gap < 0) return false;
  return compressed ? gap > 0 : gap === 0;
}

function expandGroups(head: string[], tail: string[], gap: number): number[] | null {
  const parts = [...head, ...Array.from({ length: gap }, () => "0"), ...tail];
  if (parts.length !== 8) return null;
  const groups: number[] = [];
  for (const part of parts) {
    const value = hexGroup(part);
    if (value === null) return null;
    groups.push(value);
  }
  return groups;
}

/** The two halves of a literal — a second "::" makes it invalid. */
function halvesOf(addr: string): string[] | null {
  const halves = addr.split("::");
  return halves.length > 2 ? null : halves;
}

function tailOf(halves: string[]): string[] {
  return halves.length === 2 ? splitGroups(halves[1]) : [];
}

/** A literal split into its head groups, tail groups and the gap "::" stands for. */
interface Literal {
  head: string[];
  tail: string[];
  gap: number;
  compressed: boolean;
}

function splitLiteral(addr: string): Literal | null {
  const halves = halvesOf(addr);
  if (halves === null) return null;
  const head = splitGroups(halves[0]);
  const tail = tailOf(halves);
  return { head, tail, gap: 8 - head.length - tail.length, compressed: halves.length === 2 };
}

/** The 8 groups of an IPv6 literal; the compressed form is expanded. */
function groupsOf(addr: string): number[] | null {
  const literal = splitLiteral(addr);
  if (literal === null) return null;
  if (!validGap(literal.compressed, literal.gap)) return null;
  return expandGroups(literal.head, literal.tail, literal.gap);
}

/** The IPv6 literal's 8 groups, or null when the text is not one. */
function parseIpv6Groups(addr: string): number[] | null {
  const lower = addr.toLowerCase();
  const withoutZone = lower.split("%")[0] ?? lower;
  const normalized = dottedTailToHex(withoutZone);
  if (normalized === null) return null;
  return groupsOf(normalized);
}

/** The IPv6 forms that CARRY an IPv4 address. */
interface EmbeddingRule {
  /** The leading groups that must match. */
  readonly prefix: readonly number[];
  /** The group index holding the high half of the embedded address. */
  readonly hi: number;
  /** The group index holding the low half of the embedded address. */
  readonly lo: number;
}

/**
 * ::ffff:0:0/96 (IPv4-mapped — the form the WHATWG parser and dns.lookup
 * both use), ::/96 (IPv4-compatible), ::ffff:0:0:0/96 (IPv4-translated),
 * 2002::/16 (6to4) and 64:ff9b::/96 (NAT64). The embedded address inherits
 * the IPv4 ruling.
 */
const IPV4_EMBEDDING_RULES: readonly EmbeddingRule[] = [
  { prefix: [0, 0, 0, 0, 0, 0xffff], hi: 6, lo: 7 },
  { prefix: [0, 0, 0, 0, 0, 0], hi: 6, lo: 7 },
  { prefix: [0, 0, 0, 0, 0xffff, 0], hi: 6, lo: 7 },
  { prefix: [0x2002], hi: 1, lo: 2 },
  { prefix: [0x64, 0xff9b], hi: 6, lo: 7 },
];

function matchesPrefix(groups: number[], prefix: readonly number[]): boolean {
  return groups.slice(0, prefix.length).every((value, index) => value === prefix[index]);
}

function quadOf(hi: number | undefined, lo: number | undefined): string {
  const high = hi ?? 0;
  const low = lo ?? 0;
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/** The IPv4 address an IPv6 literal embeds, or null when it embeds none. */
function embeddedIpv4(groups: number[]): string | null {
  for (const rule of IPV4_EMBEDDING_RULES) {
    if (matchesPrefix(groups, rule.prefix)) return quadOf(groups[rule.hi], groups[rule.lo]);
  }
  return null;
}

/** The IPv6 ranges that never host a public page: [mask, value] on group 0. */
const FORBIDDEN_IPV6_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0xfe00, 0xfc00], // fc00::/7 — unique local
  [0xffc0, 0xfe80], // fe80::/10 — link-local
  [0xff00, 0xff00], // ff00::/8 — multicast
  [0xff00, 0x0000], // ::/8 — reserved (incl. the deprecated fec0::/10)
];

function isForbiddenIpv6Range(groups: number[]): boolean {
  const first = groups[0] ?? 0;
  return FORBIDDEN_IPV6_RANGES.some(([mask, value]) => (first & mask) === value);
}

function isForbiddenIpv6(addr: string): boolean {
  const groups = parseIpv6Groups(addr);
  if (groups === null) return true; // fail closed on an unparsable literal
  const embedded = embeddedIpv4(groups);
  if (embedded !== null) return isForbiddenIpv4(embedded);
  return isForbiddenIpv6Range(groups);
}

function isForbiddenAddress(addr: string): boolean {
  return addr.includes(":") ? isForbiddenIpv6(addr) : isForbiddenIpv4(addr);
}

// ---------------------------------------------------------------------------
// Resolution — the vetted address that will be PINNED into the connection.
// ---------------------------------------------------------------------------

/** An address the guard has already cleared. */
interface VettedAddress {
  address: string;
  family: 4 | 6;
}

interface DnsRecord {
  address: string;
  family: number;
}

function isIpLiteral(host: string): boolean {
  return host.includes(":") || parseDottedQuad(host) !== null;
}

function literalAddress(host: string): VettedAddress | null {
  if (isForbiddenAddress(host)) return null;
  return { address: host, family: host.includes(":") ? 6 : 4 };
}

function allRecordsPublic(records: readonly DnsRecord[]): boolean {
  return records.every((record) => !isForbiddenAddress(record.address));
}

function pickPublicAddress(records: readonly DnsRecord[]): VettedAddress | null {
  if (!allRecordsPublic(records)) return null;
  const first = records[0];
  if (first === undefined) return null;
  return { address: first.address, family: first.family === 6 ? 6 : 4 };
}

/** Resolves EVERY record and requires all of them to be public; fails closed. */
async function resolvePublicAddress(host: string): Promise<VettedAddress | null> {
  if (isIpLiteral(host)) return literalAddress(host);
  try {
    const records = await lookup(host, { all: true });
    return pickPublicAddress(records);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The outbound leg — one request, the vetted address pinned into it.
// ---------------------------------------------------------------------------

/** The headers of one upstream response (the body is never read). */
interface HopResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
}

/**
 * The lookup Node uses for the connection: it answers with the ALREADY-VETTED
 * address, so the socket cannot be re-resolved to a private target between
 * the check and the connect (the DNS-rebinding TOCTOU). Node still derives
 * the Host header and the TLS SNI from the URL, so the certificate is
 * validated against the real hostname.
 */
function pinnedLookup(address: VettedAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: address.address, family: address.family }]);
      return;
    }
    callback(null, address.address, address.family);
  };
}

/**
 * ONE outbound request. The response body is never read: the response is
 * destroyed as soon as the headers arrive.
 */
function requestOnce(
  url: string,
  address: VettedAddress,
  method: "HEAD" | "GET",
): Promise<HopResponse | null> {
  return new Promise((resolve) => {
    const request = httpsRequest(
      url,
      {
        method,
        lookup: pinnedLookup(address),
        timeout: TIMEOUT_MS,
        headers: { "user-agent": USER_AGENT, accept: "*/*" },
      },
      (response) => {
        response.on("error", () => undefined);
        resolve({ statusCode: response.statusCode ?? 0, headers: response.headers });
        response.destroy();
      },
    );
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
    request.on("error", () => resolve(null));
    // The request is only SENT here. Without this the socket never leaves
    // the machine and every upstream answer is a timeout — a silent
    // "unreachable" for the whole web.
    request.end();
  });
}

/**
 * The url we actually PUT ON THE WIRE. Credentials are stripped: Node turns
 * `https://user:pass@host/` into an `Authorization: Basic …` header, so
 * forwarding them would leak the visitor's secret to the probed host.
 */
function probeUrl(url: URL): string {
  const clean = new URL(url.toString());
  clean.username = "";
  clean.password = "";
  return clean.toString();
}

function headerValue(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  if (value === undefined) return null;
  // A repeated header arrives as an array — Headers.get joins it with ", ".
  if (Array.isArray(value)) return value.join(", ");
  return value;
}

/**
 * The CSP header(s). Repeated headers join with ";" — a DIRECTIVE separator —
 * so a source list inside one header is never cut in half.
 */
function cspValue(headers: IncomingHttpHeaders): string | null {
  const value = headers["content-security-policy"];
  if (value === undefined) return null;
  return Array.isArray(value) ? value.join("; ") : value;
}

function isMethodNotAllowed(status: number): boolean {
  return status === 405 || status === 501;
}

/**
 * A HEAD that answers 3xx WITHOUT a Location is not authoritative — some
 * servers only send the target on GET. Such an answer must be re-asked.
 */
function needsGetRetry(response: HopResponse): boolean {
  if (isMethodNotAllowed(response.statusCode)) return true;
  return isRedirect(response.statusCode) && headerValue(response.headers, "location") === null;
}

/** HEAD first; a 405/501 (or a headless 3xx) falls back to GET on the same address. */
async function requestWithFallback(url: URL, address: VettedAddress): Promise<HopResponse | null> {
  const target = probeUrl(url);
  const head = await requestOnce(target, address, "HEAD");
  if (head === null) return null;
  if (!needsGetRetry(head)) return head;
  return requestOnce(target, address, "GET");
}

// ---------------------------------------------------------------------------
// The redirect walk — every hop is re-resolved and re-vetted BEFORE it is
// requested. A hop that fails either check ends the walk as unreachable.
// ---------------------------------------------------------------------------

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isRedirect(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

/** A redirect target must be https; a relative target resolves against the hop. */
function resolveLocation(location: string, current: URL): URL | null {
  try {
    const next = new URL(location, current);
    return next.protocol === "https:" ? next : null;
  } catch {
    return null;
  }
}

/** What the chain does after a response: stop, follow, or refuse. */
type Redirect = { kind: "none" } | { kind: "hop"; url: URL } | { kind: "blocked" };

function redirectTarget(response: HopResponse, current: URL): Redirect {
  if (!isRedirect(response.statusCode)) return { kind: "none" };
  const location = headerValue(response.headers, "location");
  if (location === null) return { kind: "none" };
  const next = resolveLocation(location, current);
  if (next === null) return { kind: "blocked" };
  return { kind: "hop", url: next };
}

interface WalkStep {
  response: HopResponse;
  /** The next hop to request, or null when the chain ends here. */
  next: { url: URL; address: VettedAddress } | null;
}

/** The step a response asks for: the next hop, or null when the chain stops. */
async function stepFor(response: HopResponse, url: URL): Promise<WalkStep | null> {
  const redirect = redirectTarget(response, url);
  if (redirect.kind === "blocked") return null;
  if (redirect.kind === "none") return { response, next: null };
  const address = await resolvePublicAddress(unbracketHost(redirect.url.hostname));
  if (address === null) return null;
  return { response, next: { url: redirect.url, address } };
}

async function walkStep(url: URL, address: VettedAddress): Promise<WalkStep | null> {
  const response = await requestWithFallback(url, address);
  if (response === null) return null;
  return stepFor(response, url);
}

interface WalkResult {
  response: HopResponse;
  finalUrl: URL;
}

/** Walk the chain, re-vetting EVERY hop before it is requested. */
async function walkChainUnbounded(start: URL, first: VettedAddress): Promise<WalkResult | null> {
  let current = start;
  let address = first;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const step = await walkStep(current, address);
    if (step === null) return null;
    if (step.next === null) return { response: step.response, finalUrl: current };
    current = step.next.url;
    address = step.next.address;
  }
  return null;
}

/**
 * The walk under an OVERALL deadline. Each hop may cost HEAD + a GET
 * fallback, so the per-request timeout alone allowed a ~40s verdict — a
 * single unauthenticated call holding eight sockets open. Past the budget
 * the answer is "unreachable" (the client keeps the live frame, which is the
 * safe degradation).
 */
async function walkChain(start: URL, first: VettedAddress): Promise<WalkResult | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), WALK_DEADLINE_MS);
  });
  try {
    return await Promise.race([walkChainUnbounded(start, first), expired]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

async function probeChain(url: URL, address: VettedAddress): Promise<WalkResult | null> {
  try {
    return await walkChain(url, address);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The EMBEDDER — the page that runs our browser and embeds the target.
//
// `frame-ancestors` describes who may EMBED the page:
//   - `'self'` means "a document from THIS PAGE's own origin" — so the
//     embedder must share the TARGET's origin, not merely be one of ours;
//   - an explicit source (`https://app.example`) means "a document from THAT
//     origin" — so it must equal the EMBEDDER's origin.
//
// The embedder is the origin that called this route (the app serving the
// browser). The CONFIGURED site url is deliberately NOT part of it: a
// preview deploy is not the production origin, and treating the configured
// origin as a valid embedder made the route answer "embeddable" for a page
// the browser would refuse (a dead frame instead of the preview panel).
// ---------------------------------------------------------------------------

interface Embedder {
  /** The full origin, e.g. "https://example.com". */
  origin: string;
  /** The effective port — explicit, or the scheme's default. */
  port: string;
  /** The scheme without its colon. */
  scheme: string;
  /** The hostname. */
  hostname: string;
}

function defaultPortFor(scheme: string): string {
  return scheme === "https" ? "443" : "80";
}

/** The embedder for a request — null when the request's origin is unusable. */
function embedderOriginOf(origin: string): Embedder | null {
  try {
    const url = new URL(origin);
    const scheme = url.protocol.replace(":", "");
    return {
      origin: url.origin,
      scheme,
      hostname: url.hostname,
      port: url.port === "" ? defaultPortFor(scheme) : url.port,
    };
  } catch {
    return null;
  }
}

/** A frame-ancestors source, parsed into the parts that must match. */
interface SourceHost {
  /** The source's scheme, or null when it carries none. */
  scheme: string | null;
  hostname: string;
  /** The explicit port, or null when the source carries none. */
  port: string | null;
  wildcard: boolean;
}

function splitAuthority(text: string): { hostname: string; port: string } {
  const authority = text.split(/[/?#]/)[0] ?? "";
  const colon = authority.lastIndexOf(":");
  if (colon === -1) return { hostname: authority, port: "" };
  return { hostname: authority.slice(0, colon), port: authority.slice(colon + 1) };
}

/** The explicit port of a source, or null when it carries none. */
function portOf(port: string): string | null {
  return port === "" ? null : port;
}

function parseUrlSource(src: string): SourceHost | null {
  try {
    const url = new URL(src);
    const hostname = url.hostname;
    return {
      scheme: url.protocol.replace(":", ""),
      hostname,
      port: url.port === "" ? null : url.port,
      wildcard: hostname.startsWith("*."),
    };
  } catch {
    return null;
  }
}

function parseBareSource(src: string): SourceHost | null {
  const authority = splitAuthority(src);
  const hostname = authority.hostname;
  return {
    scheme: null,
    hostname,
    port: portOf(authority.port),
    wildcard: hostname.startsWith("*."),
  };
}

function parseSource(source: string): SourceHost | null {
  const src = source.trim().toLowerCase();
  if (src.includes("://")) return parseUrlSource(src);
  return parseBareSource(src);
}

/** A strict subdomain — the apex NEVER matches a `*.` source (CSP's rule). */
function isSubdomainOf(hostname: string, base: string): boolean {
  return hostname !== base && hostname.endsWith(`.${base}`);
}

function wildcardAllowsUs(source: SourceHost, embedder: Embedder): boolean {
  const base = source.hostname.slice(2);
  return isSubdomainOf(embedder.hostname, base);
}

/** A source without a port means the DEFAULT port for its scheme. */
function portMatches(source: SourceHost, embedder: Embedder): boolean {
  if (source.port === null) return embedder.port === defaultPortFor(embedder.scheme);
  return source.port === embedder.port;
}

function originAllows(source: SourceHost, embedder: Embedder): boolean {
  if (source.hostname !== embedder.hostname) return false;
  if (source.scheme !== null && source.scheme !== embedder.scheme) return false;
  return portMatches(source, embedder);
}

function sourceAllowsUs(source: SourceHost, embedder: Embedder): boolean {
  if (source.wildcard) return wildcardAllowsUs(source, embedder);
  return originAllows(source, embedder);
}

const NONE_SOURCES = new Set(["'none'", "none"]);

function isNoneSource(source: string): boolean {
  return NONE_SOURCES.has(source.trim().toLowerCase());
}

function sourceAllowsUsText(
  source: string,
  sameOriginAsEmbedder: boolean,
  embedder: Embedder,
): boolean {
  const src = source.trim().toLowerCase();
  if (src === "*") return true;
  // 'self' = "a document from the TARGET's own origin" — so the embedder
  // must share the target's origin.
  if (src === "'self'") return sameOriginAsEmbedder;
  const parsed = parseSource(src);
  if (parsed === null) return false;
  return sourceAllowsUs(parsed, embedder);
}

// ---------------------------------------------------------------------------
// Verdict evaluation from the final response's headers.
// ---------------------------------------------------------------------------

function isDenyingXfo(value: string): boolean {
  const upper = value.toUpperCase();
  return upper.includes("DENY") || upper.includes("SAMEORIGIN");
}

/**
 * Every `frame-ancestors` source list in the CSP. A repeated header arrives
 * joined by a ";" (a directive separator), so the source list inside one
 * directive is never cut in half.
 */
function frameAncestorsLists(csp: string): string[][] {
  const lists: string[][] = [];
  for (const directive of csp.split(";")) {
    const tokens = directive.trim().split(/\s+/).filter(Boolean);
    if (tokens[0]?.toLowerCase() === "frame-ancestors") lists.push(tokens.slice(1));
  }
  return lists;
}

function listAllows(
  sources: readonly string[],
  sameOriginAsEmbedder: boolean,
  embedder: Embedder,
): boolean {
  if (sources.some(isNoneSource)) return false;
  return sources.some((source) => sourceAllowsUsText(source, sameOriginAsEmbedder, embedder));
}

function cspVerdict(
  csp: string | null,
  sameOriginAsEmbedder: boolean,
  embedder: Embedder,
): EmbedVerdict {
  if (csp === null) return OK_VERDICT;
  const lists = frameAncestorsLists(csp);
  if (lists.length === 0) return OK_VERDICT;
  const allowed = lists.every((sources) => listAllows(sources, sameOriginAsEmbedder, embedder));
  return allowed ? OK_VERDICT : CSP_BLOCKED;
}

/**
 * The verdict for one upstream response.
 *
 * `'self'` is judged against the TARGET's origin (the embedder must share
 * it); every other source is judged against the EMBEDDER's origin.
 */
function evaluateFraming(response: HopResponse, finalUrl: URL, embedder: Embedder): EmbedVerdict {
  const xfo = headerValue(response.headers, "x-frame-options");
  if (xfo !== null && isDenyingXfo(xfo)) return XFO_BLOCKED;
  const sameOriginAsEmbedder = finalUrl.origin === embedder.origin;
  return cspVerdict(cspValue(response.headers), sameOriginAsEmbedder, embedder);
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

function failureResponse(kind: FailureKind): Response {
  return kind === "invalid" ? invalidUrl() : unreachable();
}

async function verdictFor(url: URL, key: string, embedder: Embedder | null): Promise<Response> {
  const address = await resolvePublicAddress(unbracketHost(url.hostname));
  if (address === null) {
    failureCachePut(key, "invalid");
    return invalidUrl();
  }

  const outcome = await probeChain(url, address);
  if (outcome === null) {
    failureCachePut(key, "unreachable");
    return unreachable();
  }

  // An unusable request origin means we cannot tell who the embedder is —
  // the honest answer is "we cannot prove it may be framed".
  const verdict =
    embedder === null ? CSP_BLOCKED : evaluateFraming(outcome.response, outcome.finalUrl, embedder);
  verdictCachePut(key, verdict);
  return Response.json(verdict);
}

/** A cached answer for this key — the verdict, the failure, or null. */
function cachedResponse(key: string): Response | null {
  const cached = cachedVerdict(key);
  if (cached !== null) return Response.json(cached);
  const failure = cachedFailure(key);
  if (failure !== null) return failureResponse(failure);
  return null;
}

export async function GET(request: Request): Promise<Response> {
  // Per-request sweep (see the chat route): aged addresses leave the map here.
  limiter.prune();
  const requestUrl = new URL(request.url);
  if (limiter.isLimited(clientIpOf(request))) {
    return rateLimitedResponse();
  }

  const url = parseHttpsUrl(requestUrl.searchParams.get("url"));
  if (url === null) return invalidUrl();

  const key = cacheKeyFor(url);
  const cached = cachedResponse(key);
  if (cached !== null) return cached;

  return verdictFor(url, key, embedderOriginOf(requestUrl.origin));
}
