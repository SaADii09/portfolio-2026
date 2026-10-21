import { PROJECTS } from "@/lib/portfolio-data";
import { sanitizeReadmeHtml } from "@/lib/readme-sanitize";
import { deriveTimeline } from "@/lib/repo-timeline";

/**
 * Project metadata served to the browser side panel (Task 10) and cached in
 * the browserSlice meta LRU (Task 6) as well as in this route's own
 * in-memory cache. `readmeHtml` is sanitized BEFORE it is cached or
 * returned; `degraded` marks a README GitHub refused to serve (403/429 rate
 * limits) or one the repo does not have (404) — the panel keeps the repo
 * facts either way. The `timeline` rows are derived from the repo's
 * created/pushed dates and the latest release's tag + publish date.
 */
export interface ProjectMeta {
  slug: string;
  readmeHtml: string | null;
  degraded: boolean;
  timeline: { label: string; period: string }[];
  language: string | null;
  stars: number;
  homepage: string | null;
  createdAt: string;
  pushedAt: string;
}

/**
 * Allow set derives from the projects data (PROJECTS[].repoUrl) at module
 * scope — same posture as the screenshot allow-list, so an unauthenticated
 * public GET never becomes a proxy for arbitrary GitHub content burning the
 * shared 60/h per-IP quota.
 */
export const ALLOWED_REPOS: ReadonlySet<string> = new Set(
  PROJECTS.map((project) => repoSlugOfUrl(project.repoUrl)).filter((repo) => repo !== null),
);

function repoSlugOfUrl(url: string): string | null {
  try {
    const name = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
    return /^[^/]+\/[^/]+$/.test(name) ? name : null;
  } catch {
    return null;
  }
}

function isAllowedRepo(repo: string | null): repo is string {
  return repo !== null && ALLOWED_REPOS.has(repo);
}

/** PROJECTS slug owning this repo slug (the allow set comes from PROJECTS itself). */
function projectSlugFor(repo: string): string {
  const entry = PROJECTS.find((project) => repoSlugOfUrl(project.repoUrl) === repo);
  return entry === undefined ? repo : entry.slug;
}

/**
 * In-memory TTL cache for GitHub project metadata. A FULL answer lives 6h;
 * a DEGRADED one lives 60s — with ONE exception: a 404 README (the repo has
 * none) is a stable answer and caches for the full 6h even though the meta
 * is degraded, while a REFUSED README (403/429 rate limits) means "try again
 * soon" — the same rationale as the failure cache. Pattern mirrors the
 * screenshot route: bounded Map, expired-first + oldest eviction on insert.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — repo facts rarely move
const DEGRADED_TTL_MS = 60 * 1000; // 60s — a refused README must recover fast
const CACHE_MAX = 16;

/** A cache entry with its own TTL — the degraded and the full answer differ. */
interface CacheEntry {
  meta: ProjectMeta;
  at: number;
  ttlMs: number;
}

const metaCache = new Map<string, CacheEntry>();

/**
 * Negative cache for FAILED upstream reads (60s). Without it a broken
 * upstream is re-hit on every request; the short TTL keeps a failed read
 * from burning the shared 60/h per-IP GitHub quota while still recovering
 * quickly (the success cache stays at 6h — a failure never blocks recovery
 * for that long).
 */
const FAILURE_TTL_MS = 60 * 1000; // 60s — a failure must recover fast
const failureCache = new Map<string, { at: number; ttlMs: number }>();

function metaCacheGet(repo: string): ProjectMeta | null {
  const cached = metaCache.get(repo);
  if (cached === undefined) return null;
  if (Date.now() - cached.at >= cached.ttlMs) return null;
  return cached.meta;
}

/** True when a recent failure is still cached (the upstream must not be re-hit). */
function failureCached(repo: string): boolean {
  const cached = failureCache.get(repo);
  if (cached === undefined) return false;
  return Date.now() - cached.at < cached.ttlMs;
}

function failureCachePut(repo: string): void {
  // Same bounding as the success cache: drop expired entries first, then
  // oldest (insertion order) until the new entry fits under the cap.
  evictExpiredEntries(failureCache);
  evictOldestEntries(failureCache, CACHE_MAX);
  failureCache.set(repo, { at: Date.now(), ttlMs: FAILURE_TTL_MS });
}

function metaCachePut(repo: string, meta: ProjectMeta, readmeAbsent: boolean): void {
  // Bound the map: drop expired entries first, then oldest (insertion order)
  // until the new entry fits under the cap.
  evictExpiredEntries(metaCache);
  evictOldestEntries(metaCache, CACHE_MAX);
  // Only a REFUSED README (403/429) gets the short degraded TTL — its answer
  // may change as the rate limit clears. A MISSING README (404) is stable:
  // the repo has none, and re-fetching all 3 upstream calls every 60s would
  // burn the shared 60/h per-IP quota on a permanent answer.
  const ttlMs = meta.degraded && !readmeAbsent ? DEGRADED_TTL_MS : CACHE_TTL_MS;
  metaCache.set(repo, { meta, at: Date.now(), ttlMs });
}

/** Drop entries whose `at` stamp is older than their own TTL. */
function evictExpiredEntries<V extends { at: number; ttlMs: number }>(cache: Map<string, V>): void {
  for (const [key, value] of cache) {
    if (Date.now() - value.at >= value.ttlMs) cache.delete(key);
  }
}

/** Drop the oldest entries (insertion order) until the map fits under the cap. */
function evictOldestEntries<V>(cache: Map<string, V>, max: number): void {
  while (cache.size >= max) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Test plumbing: vitest shares the module instance across a file's tests.
 *
 * @expected-unused -- reset consumed only by test files (cache isolation)
 */
export function resetProjectMetaCache(): void {
  metaCache.clear();
  failureCache.clear();
}

const GITHUB_API_BASE = "https://api.github.com/repos";

/**
 * One upstream call that is allowed to die on its own — network rejections
 * become null instead of sinking the shared Promise.all (the plan pins that
 * a README/release fetch failure must never degrade the whole response).
 */
async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, init);
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function objectOfUnknown(data: unknown): Record<string, unknown> {
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
}

interface RepoFacts {
  language: string | null;
  stars: number;
  homepage: string | null;
  createdAt: string;
  pushedAt: string;
}

function repoFactsOf(data: unknown): RepoFacts | null {
  const meta = objectOfUnknown(data);
  const createdAt = asString(meta.created_at);
  if (createdAt === null) return null;
  const pushedAt = asString(meta.pushed_at);
  if (pushedAt === null) return null;
  return {
    language: asString(meta.language),
    stars: asNumberOr(meta.stargazers_count, 0),
    homepage: asString(meta.homepage),
    createdAt,
    pushedAt,
  };
}

/** The latest release's tag and publish date. */
interface ReleaseFacts {
  /** The release tag ("v1.2.0"), or null when there is no release. */
  tag: string | null;
  /** The release's publish timestamp, or null when GitHub sent none. */
  publishedAt: string | null;
}

/**
 * The latest release's tag AND publish date, or nulls when it doesn't exist
 * (404/204 — most repos have none) or the fetch/parse fails. The release
 * lookup is explicitly allowed to die without degrading the whole response.
 */
async function releaseOf(response: Response | null): Promise<ReleaseFacts> {
  if (response === null || !response.ok) return { tag: null, publishedAt: null };
  try {
    const data: unknown = await response.json();
    const meta = objectOfUnknown(data);
    return { tag: asString(meta.tag_name), publishedAt: asString(meta.published_at) };
  } catch {
    return { tag: null, publishedAt: null };
  }
}

interface UpstreamResponse {
  facts: RepoFacts;
  /** Sanitized README html, or null when GitHub refused it or it is absent. */
  readmeHtml: string | null;
  /** True when GitHub answered 404 — the repo has NO README (a stable answer). */
  readmeAbsent: boolean;
  releaseRes: Response | null;
}

async function repoFactsRequest(repo: string): Promise<RepoFacts | null> {
  const repoRes = await safeFetch(`${GITHUB_API_BASE}/${repo}`);
  if (repoRes === null) return null;
  if (!repoRes.ok) return null;
  return repoFactsOf(await repoRes.json());
}

/**
 * The README's fate: sanitized html (null when GitHub refused it or the repo
 * has none) plus whether the README is ABSENT (404). Absence is a stable
 * answer — it caches for the full TTL; a refusal (403/429) or a failed fetch
 * is transient and keeps the short degraded TTL. The body read may REJECT on
 * a truncated stream — the rejection escapes into the caller's catch, so a
 * broken body degrades into the route's contracted 502 instead of a 500
 * with a non-JSON body.
 */
interface ReadmeOutcome {
  html: string | null;
  /** GitHub answered 404 — the repo has no README (permanent, not a refusal). */
  absent: boolean;
}

async function readmeHtmlOf(readmeRes: Response | null): Promise<ReadmeOutcome> {
  if (readmeRes === null) return { html: null, absent: false };
  if (readmeRes.status === 404) return { html: null, absent: true };
  if (!readmeRes.ok) return { html: null, absent: false };
  // Sanitized BEFORE caching — the cache must never hold raw GitHub HTML.
  return { html: sanitizeReadmeHtml(await readmeRes.text()), absent: false };
}

/** The 3-upstream parallel flow: repo meta (JSON), README (HTML), latest release. */
async function fetchUpstream(repo: string): Promise<UpstreamResponse | null> {
  try {
    const [facts, readmeRes, releaseRes] = await Promise.all([
      repoFactsRequest(repo),
      safeFetch(`${GITHUB_API_BASE}/${repo}/readme`, {
        headers: { Accept: "application/vnd.github.html+json" },
      }),
      safeFetch(`${GITHUB_API_BASE}/${repo}/releases/latest`),
    ]);
    if (facts === null) return null;
    const readme = await readmeHtmlOf(readmeRes);
    return { facts, readmeHtml: readme.html, readmeAbsent: readme.absent, releaseRes };
  } catch {
    return null;
  }
}

async function fetchProjectMeta(repo: string): Promise<ProjectMeta | null> {
  const upstream = await fetchUpstream(repo);
  if (upstream === null) return null;
  const { facts, readmeHtml, readmeAbsent, releaseRes } = upstream;
  const release = await releaseOf(releaseRes);
  const meta: ProjectMeta = {
    slug: projectSlugFor(repo),
    readmeHtml,
    degraded: readmeHtml === null,
    timeline: deriveTimeline(facts.createdAt, facts.pushedAt, release.tag, release.publishedAt),
    language: facts.language,
    stars: facts.stars,
    homepage: facts.homepage,
    createdAt: facts.createdAt,
    pushedAt: facts.pushedAt,
  };
  metaCachePut(repo, meta, readmeAbsent);
  return meta;
}

/**
 * Meta for a repo, honouring the negative cache: a recent failure is served
 * from it (the upstream is not re-hit), and a fresh failure is cached so the
 * next request inside the short TTL costs no upstream call. A DEGRADED
 * answer is not a failure — it is cached in the success cache: a REFUSED
 * README (403/429) under the short TTL, so GitHub's answer is retried soon,
 * but a MISSING README (404) under the full 6h TTL, because "this repo has
 * no README" never changes and re-asking every minute would burn the shared
 * 60/h per-IP quota.
 */
async function metaFor(repo: string): Promise<ProjectMeta | null> {
  if (failureCached(repo)) return null;
  const meta = await fetchProjectMeta(repo);
  if (meta === null) failureCachePut(repo);
  return meta;
}

// GET /api/project-meta?repo=<owner/name>
//   → 200 ProjectMeta | 400 {"error":"unknown repo"} (no outbound calls)
//   → 502 {"error":"unavailable"} (upstream failure; never echoes repo/url)
export async function GET(request: Request) {
  const repo = new URL(request.url).searchParams.get("repo");
  if (!isAllowedRepo(repo)) {
    return Response.json({ error: "unknown repo" }, { status: 400 });
  }

  const cached = metaCacheGet(repo);
  if (cached !== null) return Response.json(cached);

  const meta = await metaFor(repo);
  if (meta === null) {
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
  return Response.json(meta);
}
