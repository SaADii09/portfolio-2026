import { describe, expect, it } from "vitest";

import { deriveTimeline } from "@/lib/repo-timeline";

// Interface pinned by Task 4 (pure timeline derivation, plan §Task 4):
//   deriveTimeline(createdAt, pushedAt, latestReleaseTag?) → rows labeled
//   Created → [Latest release vX.Y] → Last push, periods as "YYYY-MM";
//   unparseable dates collapse to a single {"Created","unknown"} row, never throws.

describe("deriveTimeline", () => {
  it("returns created + last-push rows when no release tag exists", () => {
    expect(deriveTimeline("2026-07-14T10:00:00Z", "2026-10-20T12:00:00Z")).toEqual([
      { label: "Created", period: "2026-07" },
      { label: "Last push", period: "2026-10" },
    ]);
  });

  it("returns created + last-push rows when the release tag is null or empty", () => {
    expect(deriveTimeline("2026-07-14T10:00:00Z", "2026-10-20T12:00:00Z", null)).toEqual([
      { label: "Created", period: "2026-07" },
      { label: "Last push", period: "2026-10" },
    ]);
    expect(deriveTimeline("2026-07-14T10:00:00Z", "2026-10-20T12:00:00Z", "")).toEqual([
      { label: "Created", period: "2026-07" },
      { label: "Last push", period: "2026-10" },
    ]);
  });

  it("inserts the release row between created and last push when a tag exists", () => {
    expect(deriveTimeline("2026-07-14T10:00:00Z", "2026-10-20T12:00:00Z", "v1.2.0")).toEqual([
      { label: "Created", period: "2026-07" },
      { label: "Latest release v1.2.0", period: "unknown" },
      { label: "Last push", period: "2026-10" },
    ]);
  });

  it("zero-pads single-digit months", () => {
    expect(deriveTimeline("2026-01-01T00:00:00Z", "2026-03-31T23:59:59Z", null)).toEqual([
      { label: "Created", period: "2026-01" },
      { label: "Last push", period: "2026-03" },
    ]);
  });

  it("collapses garbage dates to a single unknown Created row instead of throwing", () => {
    expect(deriveTimeline("not-a-date", "also-not-a-date", null)).toEqual([
      { label: "Created", period: "unknown" },
    ]);
  });

  it("treats one unparseable bound as unknown — the timeline needs both", () => {
    expect(deriveTimeline("2026-07-14T10:00:00Z", "garbage", null)).toEqual([
      { label: "Created", period: "unknown" },
    ]);
    expect(deriveTimeline("garbage", "2026-10-20T12:00:00Z", "v1.0.0")).toEqual([
      { label: "Created", period: "unknown" },
    ]);
  });
});
