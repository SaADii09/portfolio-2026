/**
 * MANUAL golden-Q&A smoke for POST /api/chat (Task 12).
 *
 * Eyes-and-brain check the assistant's grounding, not a test: it walks a fixed
 * list of visitor questions (one of them a marker prompt) and prints, per turn,
 * the latency, the reply size, the parsed action markers, and a reply excerpt.
 * Nothing here is asserted — a wrong answer is something you READ.
 *
 * Requires a running dev server with a provider configured:
 *   npm run dev
 *   npx tsx scripts/smoke-chat.ts
 *
 * Reads its own env from the shell it runs in, NOT from the dev server's .env —
 * the dev server is what talks to the provider. `SMOKE_BASE_URL` overrides the
 * base URL (default http://localhost:3000).
 *
 * Quota: each turn is a real provider call, and the route allows
 * AI_RATE_LIMIT_PER_MIN (15) requests per minute per IP — ten questions fit,
 * re-running back-to-back may not. The PROVIDER's own limit is usually the
 * tighter one: this prompt is ~2.4k tokens, so Groq's free tier (8k TPM)
 * sustains roughly two turns a minute. Set `SMOKE_DELAY_MS=35000` to pace the
 * run and avoid 429s. Never run this in CI.
 */

import { extractChatActions, type ActionRef } from "@/lib/ai/actions";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
/** Pause between turns, for providers that bill tokens per minute. */
const DELAY_MS = Number(process.env.SMOKE_DELAY_MS ?? 0);

/** The fixed visitor script — the last two are the marker prompts. */
const GOLDEN_QUESTIONS = [
  "What has Saad built?",
  "What's his tech stack?",
  "Walk me through the SaaS CRM project.",
  "How many years of experience does he have?",
  "Is Saad available for work?",
  "Where is he based, and what timezone is that?",
  "What did he do at AccellionX?",
  "Does he know LangGraph?",
  "Open the about app.",
  "Switch to the neon theme.",
] as const;

/** One route event: `{"type":"token"|"error","text":…}`. */
interface StreamPayload {
  type: string;
  text: string;
}

interface TurnResult {
  text: string;
  error: string | null;
  events: number;
  ms: number;
}

/** Parses the route's SSE body into the concatenated text plus a terminal error. */
function parseSse(body: string): Omit<TurnResult, "ms"> {
  let text = "";
  let error: string | null = null;
  let events = 0;

  for (const block of body.split("\n\n")) {
    const line = block.trim();
    if (!line.startsWith("data:")) continue;
    const payload = JSON.parse(line.slice("data:".length).trim()) as StreamPayload;
    events += 1;
    if (payload.type === "error") error = payload.text;
    else text += payload.text;
  }

  return { text, error, events };
}

/** Sends one question and returns the reply, its markers, and its timing. */
async function ask(question: string): Promise<TurnResult> {
  const started = Date.now();
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
  });
  const ms = Date.now() - started;
  const body = await res.text();

  // A pre-stream failure is a JSON body, not SSE (route contract).
  if (!res.ok) return { text: body, error: `HTTP ${res.status}`, events: 0, ms };
  return { ...parseSse(body), ms };
}

/** `verb:arg`, or `(none)` for a turn without markers. */
function actionsLabel(actions: ActionRef[]): string {
  return actions.length === 0 ? "(none)" : actions.map((a) => `${a.verb}:${a.arg}`).join(", ");
}

/** One compact report block per question. */
function report(index: number, question: string, result: TurnResult): void {
  const { text, actions } = extractChatActions(result.text);
  const chars = text.length;
  const tokens = Math.round(chars / 4);

  console.log(`\n── ${index + 1}/${GOLDEN_QUESTIONS.length} · ${question}`);
  console.log(`   ${result.ms}ms · ${chars} chars · ~${tokens} tokens · ${result.events} events`);
  console.log(`   actions: ${actionsLabel(actions)}`);
  if (result.error) console.log(`   ERROR: ${result.error}`);
  console.log(`   reply: ${text.replace(/\s+/g, " ").slice(0, 240) || "(empty)"}`);
}

/** Sleeps between turns when SMOKE_DELAY_MS asks for it (nothing after the last). */
async function pace(index: number): Promise<void> {
  if (DELAY_MS <= 0 || index >= GOLDEN_QUESTIONS.length - 1) return;
  await new Promise<void>((resolve) => setTimeout(resolve, DELAY_MS));
}

async function main(): Promise<void> {
  console.log(`golden Q&A against ${BASE_URL} (one real provider call per question)`);
  if (DELAY_MS > 0) console.log(`pacing ${DELAY_MS}ms between turns`);

  let failures = 0;
  let markers = 0;

  for (const [index, question] of GOLDEN_QUESTIONS.entries()) {
    const result = await ask(question);
    report(index, question, result);
    if (result.error) failures += 1;
    markers += extractChatActions(result.text).actions.length;
    await pace(index);
  }

  console.log(`\n${GOLDEN_QUESTIONS.length} questions · ${failures} failed · ${markers} markers`);
  console.log("Read the replies: grounding, tone, and no invented facts.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Is the dev server running? `npm run dev`, with a provider key in .env.");
  process.exitCode = 1;
});
