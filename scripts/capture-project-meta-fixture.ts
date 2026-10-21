/**
 * MANUAL, NETWORK-REQUIRED capture script (F8).
 *
 * Freezes the REAL GitHub upstream envelope the /api/project-meta route
 * depends on, so the route tests pin the real shapes instead of an
 * idealized hand-written JSON:
 *   - repo JSON          → src/test/fixtures/github/repo-portfolio-2026.json
 *   - README as HTML     → src/test/fixtures/github/readme-portfolio-2026.html
 *   - latest release JSON→ src/test/fixtures/github/release-portfolio-2026.json
 *
 * Usage (one-off, needs network + a GitHub-visible IP):
 *   npx tsx scripts/capture-project-meta-fixture.ts
 *   npx tsx scripts/capture-project-meta-fixture.ts SaADii09/other-repo
 *   npx tsx scripts/capture-project-meta-fixture.ts --release-only <owner/name>
 *
 * The repo argument defaults to the pinned allow-listed repo; a second
 * allow-listed repo can be captured when a shape is missing from the
 * default one. `--release-only` captures JUST the release envelope of a
 * public repo that publishes releases — none of the four allow-listed
 * repos does, so the release JSON shape (the `tag_name`/`published_at`
 * field names and the ISO date format) is pinned from a sample repo.
 *
 * NOT part of CI: the unit/e2e suites must never touch the network. The
 * fixtures are committed; re-run this only when GitHub's envelope changes.
 *
 * The unauthenticated GitHub API allows 60 requests/hour per IP, shared by
 * every visitor of the deployed site — a 403/429 means the quota is spent.
 * The script retries ×3 with a 5s backoff, then gives up.
 */

import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const RELEASE_ONLY = process.argv[2] === "--release-only";
const REPO = (RELEASE_ONLY ? process.argv[3] : process.argv[2]) ?? "SaADii09/portfolio-2026";
const API_BASE = `https://api.github.com/repos/${REPO}`;
const FIXTURE_DIR = join(process.cwd(), "src", "test", "fixtures", "github");

/** Fixture name suffix: the repo name, lowercased (portfolio-2026). */
const FIXTURE_SUFFIX = (REPO.split("/")[1] ?? REPO).toLowerCase();

/** A release-only capture is a shape sample, not an allow-listed repo's data. */
const RELEASE_FIXTURE_NAME = RELEASE_ONLY
  ? `release-sample-${FIXTURE_SUFFIX}.json`
  : `release-${FIXTURE_SUFFIX}.json`;

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 5_000;

/** A usable response, or the reason the script could not use it. */
type FetchOutcome =
  | { ok: true; status: number; body: string }
  | { ok: false; status: number; reason: string; notFound?: boolean };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** True for the statuses worth retrying (quota/rate limit). */
function isRateLimited(status: number): boolean {
  return status === 403 || status === 429;
}

/** The failure answer for a non-ok HTTP response. */
function failureOf(status: number): FetchOutcome {
  return status === 404
    ? { ok: false, status, reason: "not found", notFound: true }
    : { ok: false, status, reason: `HTTP ${status}` };
}

/** A one-line description of a thrown transport error. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One upstream attempt: the call plus its HTTP classification. */
async function attemptFetch(url: string, init?: RequestInit): Promise<FetchOutcome> {
  try {
    const res = await fetch(url, init);
    if (res.ok) return { ok: true, status: res.status, body: await res.text() };
    return failureOf(res.status);
  } catch (error) {
    return { ok: false, status: 0, reason: `network error: ${describeError(error)}` };
  }
}

/**
 * True when the outcome is worth another attempt: a spent quota (403/429)
 * or a transport failure. A 404 is an ANSWER, never a retry.
 */
function isRetryable(outcome: FetchOutcome): boolean {
  if (outcome.ok) return false;
  if (outcome.status === 404) return false;
  return isRateLimited(outcome.status) || outcome.status === 0;
}

/**
 * One upstream GET with the ×3 retry loop. 403/429 wait 5s and try again;
 * any other non-ok status is returned as-is (404 is meaningful for
 * /releases/latest — most repos publish no release).
 */
async function fetchWithRetry(url: string, init?: RequestInit): Promise<FetchOutcome> {
  let last: FetchOutcome = { ok: false, status: 0, reason: "unknown failure" };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    last = await attemptFetch(url, init);
    if (!isRetryable(last)) return last;
    if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS);
  }

  return last;
}

/** Writes one fixture file, creating the fixture directory on demand. */
function writeFixture(name: string, contents: string): void {
  mkdirSync(dirname(join(FIXTURE_DIR, name)), { recursive: true });
  const path = join(FIXTURE_DIR, name);
  writeFileSync(path, contents, "utf8");
  console.log(`wrote ${path} (${contents.length} bytes)`);
}

/** The repo facts JSON — must be a parseable object, not an error body. */
async function captureRepoJson(): Promise<void> {
  const outcome = await fetchWithRetry(API_BASE, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!outcome.ok) {
    throw new Error(`repo JSON capture failed: ${outcome.reason} (status ${outcome.status})`);
  }
  JSON.parse(outcome.body); // fail loudly on a non-JSON body
  writeFixture(`repo-${FIXTURE_SUFFIX}.json`, outcome.body);
}

/** The README rendered as HTML (the media type the route asks for). */
async function captureReadmeHtml(): Promise<void> {
  const outcome = await fetchWithRetry(`${API_BASE}/readme`, {
    headers: { Accept: "application/vnd.github.html+json" },
  });
  if (!outcome.ok) {
    throw new Error(`README capture failed: ${outcome.reason} (status ${outcome.status})`);
  }
  writeFixture(`readme-${FIXTURE_SUFFIX}.html`, outcome.body);
}

/**
 * The latest release JSON. A repo without releases answers 404 — that is a
 * normal shape, frozen as {"notFound":true} so the fixture stays valid JSON
 * and the route's "no release" path stays pinnable.
 */
async function captureReleaseJson(): Promise<void> {
  const outcome = await fetchWithRetry(`${API_BASE}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!outcome.ok) {
    if (outcome.notFound) {
      writeFixture(RELEASE_FIXTURE_NAME, `${JSON.stringify({ notFound: true }, null, 2)}\n`);
      return;
    }
    throw new Error(`release capture failed: ${outcome.reason} (status ${outcome.status})`);
  }
  JSON.parse(outcome.body);
  writeFixture(RELEASE_FIXTURE_NAME, outcome.body);
}

async function main(): Promise<void> {
  console.log(`capturing the real GitHub envelope for ${REPO}…`);
  if (!RELEASE_ONLY) {
    await captureRepoJson();
    await captureReadmeHtml();
  }
  await captureReleaseJson();
  console.log("done — commit the fixtures; do not run this in CI.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(
    "If this is a 403/429 the shared 60/h per-IP GitHub quota is spent — re-run later.",
  );
  process.exitCode = 1;
});
