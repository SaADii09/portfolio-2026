import { describe, it, expect } from "vitest";
import { fuzzyScore } from "@/lib/fuzzy";

describe("fuzzyScore", () => {
  it("ranks a contiguous match above a scattered one", () => {
    const contiguous = fuzzyScore("proj", "Projects");
    const scattered = fuzzyScore("pjt", "Projects");
    expect(contiguous).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(contiguous!).toBeGreaterThan(scattered!);
  });

  it("returns null when the query is not a subsequence", () => {
    expect(fuzzyScore("zzz", "Projects")).toBeNull();
  });

  it("returns null when characters appear out of order", () => {
    expect(fuzzyScore("tsj", "Projects")).toBeNull();
  });

  it("returns 0 for an empty query", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("matches case-insensitively", () => {
    expect(fuzzyScore("NEON", "Neon City")).not.toBeNull();
    expect(fuzzyScore("neon", "NEON CITY")).not.toBeNull();
  });

  it("returns null when the query does not match at all", () => {
    expect(fuzzyScore("neon", "Classic Editorial")).toBeNull();
  });

  it("returns null for an empty text with a non-empty query", () => {
    expect(fuzzyScore("a", "")).toBeNull();
  });
});
