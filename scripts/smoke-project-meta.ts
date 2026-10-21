/**
 * MANUAL spot-check for the two public proxy routes.
 *
 * Requires a running dev server (`npm run dev`) and network access. It
 * BURNS the shared 60/h per-IP GitHub quota (project-meta) and Microlink's
 * free-tier capture quota (screenshot) — never run it in CI or in a loop.
 *
 * Usage:
 *   npm run dev
 *   npx tsx scripts/smoke-project-meta.ts
 *
 * The committed fixtures (src/test/fixtures/github/) are the deterministic
 * pin; this script is for spotting an upstream envelope change by hand.
 */

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const REPO = "SaADii09/portfolio-2026";
const SCREENSHOT_URL = "https://github.com/SaADii09/portfolio-2026";

/** Prints a labelled line so the output reads as a checklist. */
function report(label: string, value: string): void {
  console.log(`${label}: ${value}`);
}

/** The timeline rows of a project-meta body (empty when the shape is off). */
function timelineOf(body: unknown): { label: string; period: string }[] {
  const meta = body as { timeline?: { label: string; period: string }[] };
  return meta.timeline ?? [];
}

/**
 * Hits /api/project-meta and prints the status plus the parsed timeline.
 * A non-200 status prints the raw body (the route's fixed error shapes).
 */
async function smokeProjectMeta(): Promise<void> {
  const url = `${BASE_URL}/api/project-meta?repo=${encodeURIComponent(REPO)}`;
  const res = await fetch(url);
  report("project-meta status", String(res.status));

  const body: unknown = await res.json();
  if (!res.ok) {
    report("project-meta body", JSON.stringify(body));
    return;
  }

  const rows = timelineOf(body);
  if (rows.length === 0) {
    report("timeline", "(empty)");
    return;
  }
  for (const row of rows) report(`timeline · ${row.label}`, row.period);
}

/**
 * Hits /api/screenshot and prints the content type + byte size. A capture
 * failure prints the status and the route's fixed error body.
 */
async function smokeScreenshot(): Promise<void> {
  const url = `${BASE_URL}/api/screenshot?url=${encodeURIComponent(SCREENSHOT_URL)}`;
  const res = await fetch(url);
  report("screenshot status", String(res.status));
  report("screenshot content-type", res.headers.get("content-type") ?? "(none)");

  const bytes = new Uint8Array(await res.arrayBuffer());
  report("screenshot bytes", String(bytes.byteLength));
}

async function main(): Promise<void> {
  report("base url", BASE_URL);
  await smokeProjectMeta();
  await smokeScreenshot();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Is the dev server running? `npm run dev`.");
  process.exitCode = 1;
});
