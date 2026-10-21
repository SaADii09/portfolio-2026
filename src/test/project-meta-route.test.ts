import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, resetProjectMetaCache } from "@/app/api/project-meta/route";

// Interface pinned by Task 4 (plan §Task 4) and consumed by Task 6 (metaLru)
// and Task 10 (side panel):
//   GET /api/project-meta?repo=<owner/name>
//     → 200 ProjectMeta (readmeHtml pre-sanitized, timeline via deriveTimeline)
//     → 400 {"error":"unknown repo"} for non-allow-listed repos, ZERO outbound calls
//     → 502 {"error":"unavailable"} when the repo-meta fetch fails
// README 403/429 degrades to { degraded: true, readmeHtml: null } with 200.
// Allow set derives from PROJECTS[].repoUrl; releases-latest 404/204 → null tag.

const REPO = "SaADii09/portfolio-2026";

const REPO_FACTS_JSON = {
  name: "portfolio-2026",
  language: "TypeScript",
  stargazers_count: 42,
  homepage: "https://example.com",
  created_at: "2026-07-14T10:00:00Z",
  pushed_at: "2026-10-20T12:00:00Z",
};

const README_HTML = '<p>hello<script>alert(1)</script></p><p style="background:red">red</p>';

function makeRequest(search: string): Request {
  return { url: `http://localhost/api/project-meta${search}` } as unknown as Request;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockClear();
  resetProjectMetaCache(); // module-scope cache would bleed metas across tests
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The 3-upstream parallel flow: repo meta, README (HTML accept), latest release. */
function mockGitHubFlow(
  readmeStatus = 200,
  releaseStatus = 200,
  releaseTag: string | null = "v1.2.0",
) {
  fetchMock
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => REPO_FACTS_JSON })
    .mockResolvedValueOnce({
      ok: readmeStatus === 200,
      status: readmeStatus,
      text: async () => README_HTML,
    })
    .mockResolvedValueOnce({
      ok: releaseStatus === 200,
      status: releaseStatus,
      json: async () => ({ tag_name: releaseTag }),
    });
}

/** Upstream failure: the repo-meta fetch 404s (the 502 path). */
function mockRepoMetaFailure() {
  fetchMock
    .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
}

describe("GET /api/project-meta", () => {
  it("returns 400 unknown repo without making any outbound calls", async () => {
    const res = await GET(makeRequest("?repo=evil/example"));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the repo param is missing", async () => {
    const res = await GET(makeRequest(""));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 bodies never echo the rejected repo", async () => {
    const res = await GET(makeRequest("?repo=evil/secret-repo"));

    expect(await res.text()).toBe('{"error":"unknown repo"}');
  });

  it("returns the ProjectMeta shape with sanitized readmeHtml and a 3-row timeline", async () => {
    mockGitHubFlow();

    const res = await GET(makeRequest(`?repo=${REPO}`));

    expect(res.status).toBe(200);
    // <script> contents removed and background style declarations stripped —
    // sanitizeReadmeHtml runs before caching.
    await expect(res.json()).resolves.toEqual({
      slug: "devos",
      readmeHtml: "<p>hello</p><p>red</p>",
      degraded: false,
      timeline: [
        { label: "Created", period: "2026-07" },
        { label: "Latest release v1.2.0", period: "unknown" },
        { label: "Last push", period: "2026-10" },
      ],
      language: "TypeScript",
      stars: 42,
      homepage: "https://example.com",
      createdAt: "2026-07-14T10:00:00Z",
      pushedAt: "2026-10-20T12:00:00Z",
    });
  });

  it("requests the README as rendered HTML from GitHub", async () => {
    mockGitHubFlow();

    await GET(makeRequest(`?repo=${REPO}`));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://api.github.com/repos/${REPO}`);
    expect(fetchMock.mock.calls[1]).toEqual([
      `https://api.github.com/repos/${REPO}/readme`,
      { headers: { Accept: "application/vnd.github.html+json" } },
    ]);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `https://api.github.com/repos/${REPO}/releases/latest`,
    );
  });

  it("keeps a two-row timeline when the release lookup 404s (most repos)", async () => {
    mockGitHubFlow(200, 404, null);

    const res = await GET(makeRequest(`?repo=${REPO}`));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { timeline: { label: string }[]; degraded: boolean };
    expect(body.timeline.map((row) => row.label)).toEqual(["Created", "Last push"]);
    expect(body.degraded).toBe(false);
  });

  it("survives a release fetch rejection without degrading the response", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => REPO_FACTS_JSON })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "<p>docs</p>" })
      .mockRejectedValueOnce(new Error("release endpoint down"));

    const res = await GET(makeRequest(`?repo=${REPO}`));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { timeline: { label: string }[]; readmeHtml: string };
    expect(body.timeline).toHaveLength(2);
    expect(body.readmeHtml).toBe("<p>docs</p>");
  });

  it("survives a 204 release response (no body to parse)", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => REPO_FACTS_JSON })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "<p>docs</p>" })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => {
          throw new Error("no body");
        },
      });

    const res = await GET(makeRequest(`?repo=${REPO}`));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { timeline: { label: string }[] };
    expect(body.timeline).toHaveLength(2);
  });

  it("serves a repeat request from the in-memory cache with no second round-trip", async () => {
    mockGitHubFlow();

    const first = await GET(makeRequest(`?repo=${REPO}`));
    expect(first.status).toBe(200);

    const second = await GET(makeRequest(`?repo=${REPO}`));
    expect(second.status).toBe(200);
    // The repeat must hit the cache — still only the initial 3 upstream calls.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await expect(second.json()).resolves.toEqual(await first.json());
  });

  it("degrades to 200 with readmeHtml null when GitHub rate-limits the README", async () => {
    mockGitHubFlow(403);

    const res = await GET(makeRequest(`?repo=${REPO}`));

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.degraded).toBe(true);
    expect(body.readmeHtml).toBeNull();
    expect(body.stars).toBe(42); // repo facts survive the degraded README
  });

  it("returns 502 with the fixed body when the repo-meta fetch fails", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const res = await GET(makeRequest(`?repo=${REPO}`));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "unavailable" });
  });

  it("returns 502 when the repo-meta fetch rejects, never echoing internals", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const res = await GET(makeRequest(`?repo=${REPO}`));

    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toBe('{"error":"unavailable"}');
    expect(text).not.toContain(REPO);
    expect(text).not.toContain("github.com");
  });

  it("returns 502 when the repo meta JSON lacks the timeline bounds", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ name: "x" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });

    const res = await GET(makeRequest(`?repo=${REPO}`));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "unavailable" });
  });

  it("maps every PROJECTS repo into the allow set", async () => {
    for (const repo of [
      "SaADii09/portfolio-2026",
      "SaADii09/Auth-kit-FE",
      "SaADii09/venuze-dashboard",
      "SaADii09/MCP-OpsBridge",
    ]) {
      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => REPO_FACTS_JSON })
        .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ tag_name: "v1.0.0" }),
        });

      const res = await GET(makeRequest(`?repo=${repo}`));
      expect(res.status).toBe(200);
    }
  });

  it("returns 502 with the fixed body when the README body read rejects", async () => {
    // A truncated upstream body rejects `text()` — the read must degrade
    // into the contracted 502 {"error":"unavailable"}, never a 500 crash
    // with a non-JSON body.
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => REPO_FACTS_JSON })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => {
          throw new Error("truncated body");
        },
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tag_name: "v1.0.0" }) });

    const res = await GET(makeRequest(`?repo=${REPO}`));

    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toBe('{"error":"unavailable"}');
    expect(text).not.toContain(REPO);
  });

  it("caches a failed fetch — a repeat failure makes no second upstream round-trip", async () => {
    mockRepoMetaFailure();

    const first = await GET(makeRequest(`?repo=${REPO}`));
    expect(first.status).toBe(502);
    const callsAfterFirst = fetchMock.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const second = await GET(makeRequest(`?repo=${REPO}`));
    expect(second.status).toBe(502);
    await expect(second.json()).resolves.toEqual({ error: "unavailable" });
    // The negative cache absorbs the repeat — no new upstream calls.
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it("re-attempts the upstream once the negative-cache TTL expires", async () => {
    vi.useFakeTimers();
    try {
      mockRepoMetaFailure();

      const first = await GET(makeRequest(`?repo=${REPO}`));
      expect(first.status).toBe(502);
      const callsAfterFirst = fetchMock.mock.calls.length;

      // Still inside the negative TTL — no new upstream attempt.
      await GET(makeRequest(`?repo=${REPO}`));
      expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);

      vi.advanceTimersByTime(61_000);

      const third = await GET(makeRequest(`?repo=${REPO}`));
      expect(third.status).toBe(502);
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    } finally {
      vi.useRealTimers();
    }
  });

  it("serves a successful fetch after a cached failure once the TTL expires", async () => {
    vi.useFakeTimers();
    try {
      mockRepoMetaFailure();
      const first = await GET(makeRequest(`?repo=${REPO}`));
      expect(first.status).toBe(502);

      vi.advanceTimersByTime(61_000);

      mockGitHubFlow();
      const recovered = await GET(makeRequest(`?repo=${REPO}`));
      expect(recovered.status).toBe(200);
      await expect(recovered.json()).resolves.toMatchObject({ degraded: false });
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── F8: the REAL GitHub envelope (frozen fixtures) ──────────────────────────
//
// The suite's idealized JSON (REPO_FACTS_JSON) never proved the route
// parses GitHub's ACTUAL shapes. The fixtures below are the RAW upstream
// bodies captured once by scripts/capture-project-meta-fixture.ts — the
// repo JSON, the README rendered as HTML, and the /releases/latest answer.
// The route must parse THESE, not a hand-written approximation.

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "github");

/** The captured repo JSON (raw upstream body). */
const REPO_FIXTURE = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "repo-portfolio-2026.json"), "utf8"),
) as Record<string, unknown>;

/** The captured README, exactly as GitHub served it as HTML. */
const README_FIXTURE = readFileSync(join(FIXTURE_DIR, "readme-portfolio-2026.html"), "utf8");

/** The captured /releases/latest answer (this repo publishes no release). */
const RELEASE_FIXTURE = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "release-portfolio-2026.json"), "utf8"),
) as Record<string, unknown>;

/**
 * URL-aware upstream mock serving the three captured bodies.
 *
 * The ordered `mockResolvedValueOnce` style used above cannot express
 * "the README fetch answers HTML, the release fetch 404s" — it depends on
 * the order the route happens to issue its three parallel calls. Keying on
 * the request URL is order-independent and mirrors the real upstream.
 */
function mockGitHubFixtures() {
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith("/readme")) {
      return Promise.resolve({ ok: true, status: 200, text: async () => README_FIXTURE });
    }
    if (url.endsWith("/releases/latest")) {
      return Promise.resolve({ ok: false, status: 404, json: async () => RELEASE_FIXTURE });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => REPO_FIXTURE });
  });
}

describe("GET /api/project-meta — the real GitHub envelope", () => {
  it("serves the captured repo facts verbatim", async () => {
    mockGitHubFixtures();

    const res = await GET(makeRequest(`?repo=${REPO}`));

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.stars).toBe(REPO_FIXTURE.stargazers_count);
    expect(body.language).toBe(REPO_FIXTURE.language);
    expect(body.homepage).toBe(REPO_FIXTURE.homepage);
    expect(body.createdAt).toBe(REPO_FIXTURE.created_at);
    expect(body.pushedAt).toBe(REPO_FIXTURE.pushed_at);
  });

  it("derives the timeline from the captured dates", async () => {
    mockGitHubFixtures();

    const res = await GET(makeRequest(`?repo=${REPO}`));

    const body = (await res.json()) as { timeline: { label: string; period: string }[] };
    // The captured repo was created in July 2026 and last pushed in
    // October 2026 — the real months, derived from the real timestamps.
    expect(body.timeline).toEqual([
      { label: "Created", period: "2026-07" },
      { label: "Last push", period: "2026-10" },
    ]);
  });

  it("sanitizes the captured README into real markup", async () => {
    mockGitHubFixtures();

    const res = await GET(makeRequest(`?repo=${REPO}`));

    const body = (await res.json()) as { readmeHtml: string; degraded: boolean };
    expect(body.degraded).toBe(false);
    // The captured body is GitHub's rendered README (a <div id="readme">
    // wrapper around an <article>); the heading survives sanitization.
    expect(body.readmeHtml).toContain("<h1");
    expect(body.readmeHtml).toContain("DevOS Portfolio");
    // …but nothing executable or restyling survives it.
    for (const tag of ["script", "style", "link", "base", "meta"]) {
      expect(body.readmeHtml, tag).not.toMatch(new RegExp(`<${tag}\\b`, "i"));
    }
    expect(body.readmeHtml).not.toMatch(/\bonerror\s*=/i);
    // The sanitizer rewrote the anchors' rel="nofollow" into the forced
    // target/rel pair — proof the raw body was sanitized, not echoed.
    expect(body.readmeHtml).not.toContain("nofollow");
    expect(body.readmeHtml).toContain('rel="noopener noreferrer"');
  });

  it("degrades to a two-row timeline on the captured no-release answer", async () => {
    mockGitHubFixtures();

    const res = await GET(makeRequest(`?repo=${REPO}`));

    const body = (await res.json()) as { timeline: { label: string }[] };
    // The captured /releases/latest answer is GitHub's 404 for a repo with
    // no release — the timeline drops the release row.
    expect(RELEASE_FIXTURE).toEqual({ notFound: true });
    expect(body.timeline.map((row) => row.label)).toEqual(["Created", "Last push"]);
  });
});
