/**
 * Resolver for the captured provider bodies (Task 12).
 *
 * `scripts/capture-ai-fixture.ts` writes the RAW upstream SSE body as
 * `<provider>.sse`, so the fixture goes back into the adapter's parser
 * unchanged.
 *
 * A missing fixture means the owner has not run the capture for that provider
 * yet: the gated test skips, and the inline transcript stays the pin.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_DIR = join(process.cwd(), "src", "test", "fixtures", "ai");

/** The captured SSE body for `provider`, or null when none has been captured. */
export function readAiFixture(provider: string): string | null {
  const path = join(FIXTURE_DIR, `${provider}.sse`);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}
