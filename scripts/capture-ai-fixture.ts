/**
 * MANUAL, NETWORK-REQUIRED capture script (Task 12).
 *
 * Freezes a REAL provider streaming body so the adapter tests pin the upstream
 * wire format instead of a hand-written idealised transcript:
 *   - anthropic            → src/test/fixtures/ai/anthropic.sse
 *   - groq / openrouter    → src/test/fixtures/ai/<name>.sse
 *   - ollama / openai      → src/test/fixtures/ai/<name>.sse
 *
 * The body is saved VERBATIM — the fixture is fed straight back into the
 * adapter's parser, so stripping or re-framing `data:` lines would defeat the
 * point. Every capturable endpoint here streams SSE, so the file is
 * `<provider>.sse`; a non-SSE body (for example Ollama's NATIVE api, which is
 * NDJSON) is refused rather than stored in a shape the parser never sees.
 * `src/test/ai-fixture.ts` resolves the file.
 *
 * Usage (one-off, needs network + the provider key already in your env):
 *   npx tsx scripts/capture-ai-fixture.ts anthropic
 *   npx tsx scripts/capture-ai-fixture.ts groq
 *   npx tsx scripts/capture-ai-fixture.ts openrouter   # set AI_MODEL to the :free id
 *   npx tsx scripts/capture-ai-fixture.ts ollama       # keyless, needs a local server
 *
 * Env: AI_MODEL overrides the pinned default model; CAPTURE_PROMPT overrides
 * the prompt. The request mirrors the production framing (system + one user
 * turn + stream:true), so the captured body is the shape the adapter sees.
 *
 * NOT part of CI: no suite may touch the network. The fixtures are committed;
 * re-run this only when a provider changes its wire format.
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const FIXTURE_DIR = join(process.cwd(), "src", "test", "fixtures", "ai");
const ANTHROPIC_VERSION = "2023-06-01";
const CAPTURE_SYSTEM = "You are a concise assistant embedded in a portfolio site.";
const DEFAULT_PROMPT = "What has Saad built? Answer in one short paragraph.";

/** One capturable endpoint, matching the `.env.example` swap recipe. */
interface ProviderSpec {
  baseUrl: string;
  path: string;
  model: string;
  /** Env vars checked in order for the key; empty = keyless. */
  keyEnvs: readonly string[];
}

const PROVIDERS: Record<string, ProviderSpec> = {
  anthropic: {
    baseUrl: "https://api.anthropic.com",
    path: "/v1/messages",
    model: "claude-sonnet-4-20250514",
    keyEnvs: ["ANTHROPIC_API_KEY", "AI_API_KEY"],
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    path: "/chat/completions",
    // Groq retires models regularly; check `GET /openai/v1/models` if this 404s.
    model: "openai/gpt-oss-120b",
    keyEnvs: ["AI_API_KEY"],
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    path: "/chat/completions",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    keyEnvs: ["AI_API_KEY"],
  },
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    path: "/chat/completions",
    model: "llama3.1",
    keyEnvs: [],
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    path: "/chat/completions",
    model: "gpt-4o-mini",
    keyEnvs: ["AI_API_KEY"],
  },
};

/** The resolved capture target, or a loud failure listing what is capturable. */
function targetFor(raw: string | undefined): { name: string; spec: ProviderSpec } {
  const name = raw ?? "";
  const spec = PROVIDERS[name];
  if (!spec) {
    const names = Object.keys(PROVIDERS).join("|");
    throw new Error(`usage: npx tsx scripts/capture-ai-fixture.ts <${names}>`);
  }
  return { name, spec };
}

/** The first non-empty value among `names`, or "" when none is set. */
function envValue(names: readonly string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

/** The provider's key, or a loud failure naming the env var to export. Keyless targets return "". */
function requireKey(spec: ProviderSpec): string {
  const key = envValue(spec.keyEnvs);
  if (spec.keyEnvs.length > 0 && key === "") {
    throw new Error(`${spec.keyEnvs.join(" or ")} is not set — export it first.`);
  }
  return key;
}

/** An env var override with a pinned fallback (blank counts as unset). */
function setting(envName: string, fallback: string): string {
  return process.env[envName]?.trim() || fallback;
}

/** The provider's auth headers, byte-identical to what the adapter sends. */
function headersFor(name: string, key: string): Record<string, string> {
  if (name === "anthropic") return { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION };
  return key === "" ? {} : { Authorization: `Bearer ${key}` };
}

/** The production request body: same fields, same framing, one user turn. */
function bodyFor(name: string, model: string, prompt: string): object {
  const messages = [{ role: "user", content: prompt }];
  if (name === "anthropic") {
    return {
      model,
      max_tokens: 256,
      temperature: 0.3,
      system: CAPTURE_SYSTEM,
      messages,
      stream: true,
    };
  }
  return {
    model,
    max_tokens: 256,
    temperature: 0.3,
    messages: [{ role: "system", content: CAPTURE_SYSTEM }, ...messages],
    stream: true,
  };
}

/** POSTs and returns the RAW body text; a non-200 aborts with the upstream detail. */
async function postJson(
  url: string,
  headers: Record<string, string>,
  body: object,
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`upstream ${res.status}: ${text.slice(0, 400)}`);
  }
  return text;
}

/**
 * Refuses a body the adapter would never parse. Every endpoint here streams
 * SSE (`data: …`); a bare-JSON body means the base URL points at a native API
 * (Ollama's `/api/chat`, say) instead of its OpenAI-compat `/v1` path.
 */
function assertSse(body: string): void {
  const firstLine = body.split("\n").find((line) => line.trim() !== "") ?? "";
  if (!firstLine.trimStart().startsWith("data:")) {
    throw new Error(
      `captured body is not SSE — check the base URL (want the /v1 OpenAI-compat path). First line: ${firstLine.slice(0, 120)}`,
    );
  }
}

/** Writes the verbatim body into the fixture directory and reports its size. */
function writeFixture(name: string, body: string): void {
  assertSse(body);
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const path = join(FIXTURE_DIR, `${name}.sse`);
  writeFileSync(path, body, "utf8");
  console.log(`wrote ${path} (${body.length} bytes)`);
}

async function main(): Promise<void> {
  const { name, spec } = targetFor(process.argv[2]);
  const key = requireKey(spec);
  const model = setting("AI_MODEL", spec.model);
  const prompt = setting("CAPTURE_PROMPT", DEFAULT_PROMPT);
  const url = `${spec.baseUrl.replace(/\/+$/, "")}${spec.path}`;
  console.log(`capturing ${name} (${model}) from ${url}…`);

  const body = await postJson(url, headersFor(name, key), bodyFor(name, model, prompt));
  writeFixture(name, body);
  console.log("done — commit the fixture; the adapter suite picks it up automatically.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(
    "A 401/403 means the key is wrong; a 404 usually means a bad model id or base URL.",
  );
  process.exitCode = 1;
});
