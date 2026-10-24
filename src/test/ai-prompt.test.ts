import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ACTIONS_DOCS } from "@/lib/ai/actions";

/** The KB file is absent in the test env — fs.readFileSync throws → null KB → base-only prompt. */
vi.mock("fs", () => {
  const readFileSync = vi.fn(() => {
    throw new Error("no KB file in test env");
  });
  // `prompt.ts` uses the default import; named + default both point at the mock.
  return { readFileSync, default: { readFileSync } };
});

import { buildSystemPrompt, kbSizeThreshold } from "@/lib/ai/prompt";
import fs from "fs";
const mockReadFileSync = vi.mocked(fs.readFileSync);

afterEach(() => {
  delete process.env.AI_KB_FULL_THRESHOLD;
});

describe("kbSizeThreshold", () => {
  it("defaults to 24000 chars", () => {
    expect(kbSizeThreshold()).toBe(24_000);
  });

  it("honors AI_KB_FULL_THRESHOLD env", () => {
    process.env.AI_KB_FULL_THRESHOLD = "5000";
    expect(kbSizeThreshold()).toBe(5000);
  });
});

describe("buildSystemPrompt — no KB file", () => {
  beforeEach(() => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("no KB file");
    });
  });

  it("returns base persona + ACTIONS_DOCS with no context section", () => {
    const prompt = buildSystemPrompt({ userQuery: "who are you?" });
    expect(prompt).toContain("DevOS AI");
    expect(prompt).toContain("The current year is 2026");
    expect(prompt).toContain("[[action:");
    expect(prompt).toContain(ACTIONS_DOCS.split("\n")[0]);
    expect(prompt).not.toContain("Relevant context:");
  });

  it("does not add a context header when there is nothing to say", () => {
    const prompt = buildSystemPrompt({ userQuery: "" });
    expect(prompt).toContain("DevOS AI");
    expect(prompt.split("Relevant context:").length).toBe(1);
  });

  /**
   * Live smoke (2026-10-25, groq/gpt-oss-120b) produced two grounding defects:
   * a CRM walkthrough that invented "B2B teams … real-time collaboration, secure
   * data handling", and an answer that labelled Saad's own role "Your Role".
   * These two rules are the fix, and they are pinned so a later prompt edit
   * cannot quietly drop them.
   */
  it("pins third-person address and the no-embellishment rule", () => {
    const prompt = buildSystemPrompt({ userQuery: "walk me through the CRM" });
    expect(prompt).toContain("third person");
    expect(prompt).toContain('never call his role "your role"');
    expect(prompt).toContain("Never invent goals");
  });
});

describe("buildSystemPrompt — full KB injection", () => {
  beforeEach(() => {
    mockReadFileSync.mockImplementation(
      () => "Saad is a full-stack engineer who loves TypeScript.",
    );
  });

  it("injects the full KB verbatim when under the threshold", () => {
    const prompt = buildSystemPrompt({ userQuery: "what does Saad do?" });
    expect(prompt).toContain("Saad is a full-stack engineer who loves TypeScript.");
    expect(prompt).toContain("Relevant context:");
  });

  it("keeps ACTIONS_DOCS alongside the injected KB", () => {
    const prompt = buildSystemPrompt({ userQuery: "x" });
    expect(prompt).toContain("[[action:");
    expect(prompt).toContain("Saad is a full-stack engineer");
  });
});

describe("buildSystemPrompt — BM25 fallback (KB over threshold)", () => {
  it("does not inject the full KB verbatim when it exceeds the threshold", () => {
    const longKb = "x".repeat(100);
    mockReadFileSync.mockImplementation(() => longKb);
    process.env.AI_KB_FULL_THRESHOLD = "10";
    try {
      const prompt = buildSystemPrompt({ userQuery: "anything" });
      expect(prompt).not.toContain(longKb);
    } finally {
      delete process.env.AI_KB_FULL_THRESHOLD;
    }
  });
});
