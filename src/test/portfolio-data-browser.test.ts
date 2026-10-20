import { describe, expect, it } from "vitest";

import { PROJECTS, projectBySlug } from "@/lib/portfolio-data";

// Contract pinned by Task 1 (browser tabs): every PROJECTS entry carries its
// own identity — a unique URL-safe slug, a per-project GitHub repo link, and
// (when one exists) the deployed demo URL. The old shared `url` field is gone.

const GITHUB_OWNER = "https://github.com/SaADii09/";

describe("PROJECTS data contract", () => {
  it("has exactly 4 entries", () => {
    expect(PROJECTS).toHaveLength(4);
  });

  it("every slug matches /^[a-z0-9-]+$/ and is unique", () => {
    const slugs = PROJECTS.map((p) => p.slug);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every repoUrl is a https github.com/SaADii09 repo link", () => {
    for (const p of PROJECTS) {
      expect(p.repoUrl.startsWith(GITHUB_OWNER)).toBe(true);
      const repo = p.repoUrl.slice(GITHUB_OWNER.length);
      expect(repo.length).toBeGreaterThan(0);
      expect(repo).not.toContain("/"); // owner prefix + repo name only
    }
  });

  it("maps each project to its owner-confirmed repo and demo", () => {
    expect(projectBySlug("devos")?.repoUrl).toBe("https://github.com/SaADii09/portfolio-2026");
    expect(projectBySlug("devos")?.demoUrl).toBe("https://portfolio-2026-sp9k.vercel.app");

    expect(projectBySlug("ai-job-portal")?.repoUrl).toBe("https://github.com/SaADii09/Auth-kit-FE");
    expect(projectBySlug("ai-job-portal")?.demoUrl).toBe("https://auth-kit-fe.vercel.app");

    expect(projectBySlug("saas-crm")?.repoUrl).toBe("https://github.com/SaADii09/venuze-dashboard");
    expect(projectBySlug("saas-crm")?.demoUrl).toBe("https://venuze-dashboard.vercel.app");

    expect(projectBySlug("api-automation")?.repoUrl).toBe(
      "https://github.com/SaADii09/MCP-OpsBridge",
    );
    expect(projectBySlug("api-automation")?.demoUrl).toBeUndefined();
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
