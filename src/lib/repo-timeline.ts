/**
 * Pure GitHub-timeline derivation for the project-meta panel — no fetching,
 * no state, so the route's complexity budget stays fallow-clean.
 *
 * Rows read as a vertical timeline: Created → (Latest release vX.Y when a
 * release exists) → Last push. Only the release tag is known upstream (the
 * plan feeds `tag_name`, not the release date), so the release row's period
 * is deliberately "unknown" rather than an invented month.
 */

export interface TimelineRow {
  label: string;
  period: string;
}

/** "YYYY-MM" from an ISO-ish timestamp, or null when it won't parse. */
function utcMonth(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

/**
 * Builds the timeline rows. Never throws: an unparseable bound (creation or
 * last push) collapses everything to a single {"Created","unknown"} row,
 * since a two/three-row timeline needs both ends.
 */
export function deriveTimeline(
  createdAt: string,
  pushedAt: string,
  latestReleaseTag?: string | null,
): TimelineRow[] {
  const created = utcMonth(createdAt);
  const pushed = utcMonth(pushedAt);
  if (created === null || pushed === null) {
    return [{ label: "Created", period: "unknown" }];
  }
  const rows: TimelineRow[] = [{ label: "Created", period: created }];
  if (latestReleaseTag) {
    rows.push({ label: `Latest release ${latestReleaseTag}`, period: "unknown" });
  }
  rows.push({ label: "Last push", period: pushed });
  return rows;
}
