import { describe, expect, it } from "vitest";

import { PROJECTS, projectBySlug } from "@/lib/portfolio-data";

// Contract pinned by Task 1 (browser tabs): every PROJECTS entry carries its
// own identity — a unique URL-safe slug, a per-project GitHub repo link, and
// (when one exists) the deployed demo URL. The old shared `url` field is gone.
//
// T1 (hardening round): the owner-confirmed mapping is pinned LITERALLY
// (`as const` keeps the slug types narrow) and split PER CONCERN — the slug
// set, the repo mapping and the demo mapping are separate pins, so a broken
// concern names itself instead of hiding inside one monolithic assertion.

const GITHUB_OWNER = "https://github.com/SaADii09/";

/** The owner-confirmed slug → repo/demo mapping (literal contract). */
const EXPECTED_MAPPING = [
  {
    slug: "devos",
    repoUrl: "https://github.com/SaADii09/portfolio-2026",
    demoUrl: "https://portfolio-2026-sp9k.vercel.app",
  },
  {
    slug: "ai-job-portal",
    repoUrl: "https://github.com/SaADii09/Auth-kit-FE",
    demoUrl: "https://auth-kit-fe.vercel.app",
  },
  {
    slug: "saas-crm",
    repoUrl: "https://github.com/SaADii09/venuze-dashboard",
    demoUrl: "https://venuze-dashboard.vercel.app",
  },
  {
    slug: "api-automation",
    repoUrl: "https://github.com/SaADii09/MCP-OpsBridge",
    demoUrl: undefined,
  },
] as const;

describe("PROJECTS data contract", () => {
  it("has exactly 4 entries", () => {
    expect(PROJECTS).toHaveLength(4);
  });

  it("carries exactly the owner-confirmed slugs", () => {
    expect(PROJECTS.map((p) => p.slug)).toEqual(EXPECTED_MAPPING.map((m) => m.slug));
  });

  it("every slug matches /^[a-z0-9-]+$/ and is unique", () => {
    const slugs = PROJECTS.map((p) => p.slug);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("no slug is integer-like (the LRU cache keys are slugs)", () => {
    // `evictLru` walks `Object.keys`, which orders INTEGER-like keys
    // numerically BEFORE the string keys — a numeric slug would break the
    // least-recently-used eviction order. The slugs are kebab-case, so the
    // insertion order holds; pin that (it backs the warm-set caveat).
    for (const { slug } of EXPECTED_MAPPING) {
      expect(slug, `slug ${slug} must not be integer-like`).not.toMatch(/^(0|[1-9]\d*)$/);
    }
  });

  it("every repoUrl is a https github.com/SaADii09 repo link", () => {
    for (const p of PROJECTS) {
      expect(p.repoUrl.startsWith(GITHUB_OWNER)).toBe(true);
      const repo = p.repoUrl.slice(GITHUB_OWNER.length);
      expect(repo.length).toBeGreaterThan(0);
      expect(repo).not.toContain("/"); // owner prefix + repo name only
    }
  });

  it("maps every slug to its owner-confirmed repo", () => {
    for (const { slug, repoUrl } of EXPECTED_MAPPING) {
      expect(projectBySlug(slug)?.repoUrl, `repo of ${slug}`).toBe(repoUrl);
    }
  });

  it("maps every slug to its owner-confirmed demo (none for api-automation)", () => {
    for (const { slug, demoUrl } of EXPECTED_MAPPING) {
      expect(projectBySlug(slug)?.demoUrl, `demo of ${slug}`).toBe(demoUrl);
    }
  });

  it("resolves entries by slug and returns undefined for unknown slugs", () => {
    expect(projectBySlug("devos")?.title).toBe("DevOS Portfolio");
    expect(projectBySlug("nope")).toBeUndefined();
  });

  it("no longer carries the shared url field", () => {
    for (const p of PROJECTS) {
      expect("url" in p).toBe(false);
    }
  });
});
