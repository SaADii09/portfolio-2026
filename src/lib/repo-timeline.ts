/**
 * Pure GitHub-timeline derivation for the project-meta panel — no fetching,
 * no state, so the route's complexity budget stays fallow-clean.
 *
 * Rows read as a vertical timeline: Created → (Latest release vX.Y when a
 * release exists) → Last push. The release row's period is the release's
 * publish month when GitHub sent one (`published_at`), and "unknown"
 * otherwise — never an invented month.
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
 * The release row's period: the release's publish month, or "unknown" when
 * GitHub sent no date (or an unparseable one). A missing date must not
 * invent a month.
 */
function releasePeriod(publishedAt: string | null | undefined): string {
  return utcMonth(publishedAt ?? "") ?? "unknown";
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
  latestReleasePublishedAt?: string | null,
): TimelineRow[] {
  const created = utcMonth(createdAt);
  const pushed = utcMonth(pushedAt);
  if (created === null || pushed === null) {
    return [{ label: "Created", period: "unknown" }];
  }
  const rows: TimelineRow[] = [{ label: "Created", period: created }];
  if (latestReleaseTag) {
    rows.push({
      label: `Latest release ${latestReleaseTag}`,
      period: releasePeriod(latestReleasePublishedAt),
    });
  }
  rows.push({ label: "Last push", period: pushed });
  return rows;
}
