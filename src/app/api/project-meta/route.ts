import { PROJECTS } from "@/lib/portfolio-data";
import { sanitizeReadmeHtml } from "@/lib/readme-sanitize";
import { deriveTimeline } from "@/lib/repo-timeline";

/**
 * Project metadata served to the browser side panel (Task 10) and cached in
 * the browserSlice meta LRU (Task 6). `readmeHtml` is sanitized BEFORE it is
 * cached or returned; `degraded` marks a README GitHub refused to serve
 * (403/429 rate limits) — the panel keeps the repo facts either way.
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
 * In-memory TTL cache for GitHub project metadata (6h). Pattern mirrors the
 * screenshot route: bounded Map, expired-first + oldest eviction on insert.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — repo facts rarely move
const CACHE_MAX = 16;
const metaCache = new Map<string, { meta: ProjectMeta; at: number }>();

function metaCacheGet(repo: string): ProjectMeta | null {
  const cached = metaCache.get(repo);
  if (cached === undefined || Date.now() - cached.at >= CACHE_TTL_MS) return null;
  return cached.meta;
}

function metaCachePut(repo: string, meta: ProjectMeta): void {
  // Bound the map: drop expired entries first, then oldest (insertion order)
  // until the new entry fits under the cap.
  evictExpiredCacheEntries();
  evictOldestCacheEntries();
  metaCache.set(repo, { meta, at: Date.now() });
}

function evictExpiredCacheEntries(): void {
  for (const [key, value] of metaCache) {
    if (Date.now() - value.at > CACHE_TTL_MS) metaCache.delete(key);
  }
}

function evictOldestCacheEntries(): void {
  while (metaCache.size >= CACHE_MAX) {
    const oldest = metaCache.keys().next().value;
    if (oldest === undefined) break;
    metaCache.delete(oldest);
  }
}

/**
 * Test plumbing: vitest shares the module instance across a file's tests.
 *
 * @expected-unused -- reset consumed only by test files (cache isolation)
 */
export function resetProjectMetaCache(): void {
  metaCache.clear();
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

/**
 * `tag_name` of /releases/latest, or null when it doesn't exist (404/204 —
 * most repos have none) or the fetch/parse fails. The release lookup is
 * explicitly allowed to die without degrading the whole response.
 */
async function releaseTagOf(response: Response | null): Promise<string | null> {
  if (response === null || !response.ok) return null;
  try {
    const data: unknown = await response.json();
    return asString(objectOfUnknown(data).tag_name);
  } catch {
    return null;
  }
}

interface UpstreamResponse {
  facts: RepoFacts;
  readmeRes: Response | null;
  releaseRes: Response | null;
}

async function repoFactsRequest(repo: string): Promise<RepoFacts | null> {
  const repoRes = await safeFetch(`${GITHUB_API_BASE}/${repo}`);
  if (repoRes === null) return null;
  if (!repoRes.ok) return null;
  return repoFactsOf(await repoRes.json());
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
    return facts === null ? null : { facts, readmeRes, releaseRes };
  } catch {
    return null;
  }
}

async function fetchProjectMeta(repo: string): Promise<ProjectMeta | null> {
  const upstream = await fetchUpstream(repo);
  if (upstream === null) return null;
  const { facts, readmeRes, releaseRes } = upstream;
  let readmeHtml: string | null = null;
  if (readmeRes !== null && readmeRes.ok) {
    // Sanitized BEFORE caching — the cache must never hold raw GitHub HTML.
    readmeHtml = sanitizeReadmeHtml(await readmeRes.text());
  }
  const meta: ProjectMeta = {
    slug: projectSlugFor(repo),
    readmeHtml,
    degraded: readmeHtml === null,
    timeline: deriveTimeline(facts.createdAt, facts.pushedAt, await releaseTagOf(releaseRes)),
    language: facts.language,
    stars: facts.stars,
    homepage: facts.homepage,
    createdAt: facts.createdAt,
    pushedAt: facts.pushedAt,
  };
  metaCachePut(repo, meta);
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

  const meta = await fetchProjectMeta(repo);
  if (meta === null) {
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
  return Response.json(meta);
}
