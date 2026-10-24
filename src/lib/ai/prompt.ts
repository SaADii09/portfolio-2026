/**
 * System-prompt builder (design §Prompt builder). Builds the `system` string
 * the route sends to the adapter: a base persona, the action-marker protocol
 * (ACTIONS_DOCS from Task 1), and portfolio knowledge — either the FULL
 * knowledge base (100% recall, when it fits under `AI_KB_FULL_THRESHOLD`)
 * or a BM25-retrieved chunk (size-threshold fallback).
 *
 * Pure apart from the one disk read for the KB file (cached after first use).
 * Safe on the server route only — never bundled to the client.
 */
import fs from "fs";
import path from "path";
import { retrieveRelevantContext } from "@/lib/rag";
import { ACTIONS_DOCS } from "@/lib/ai/actions";

const KB_PATH = path.join(process.cwd(), "data", "portfolio-knowledge.md");
const DEFAULT_KB_FULL_THRESHOLD = 24_000; // chars

export const SYSTEM_PROMPT_BASE = `You are DevOS AI, an assistant embedded in Saad Ahmad's interactive portfolio website.
You help visitors learn about Saad's work, skills, projects, and experience.
Be concise, friendly, and helpful. Use markdown sparingly (bold for emphasis, no headings on short answers).
If asked something outside your knowledge, say you don't know rather than making up an answer.
Speak about Saad in the third person ("Saad", "he") — never address the visitor as Saad and never call his role "your role".
State only what the context below supports. Never invent goals, customers, metrics, team size, timelines, or the reasons behind a decision; if a detail is missing, say it isn't documented.
The current year is 2026.

${ACTIONS_DOCS}
`;

let cachedKb: { text: string } | null = null;

function loadFullKb(): string | null {
  try {
    return fs.readFileSync(KB_PATH, "utf-8");
  } catch {
    return null;
  }
}

/** The full knowledge-base text, read once and cached. Null when the file is absent (dev without the owner's KB file). */
export function getFullKb(): string | null {
  if (!cachedKb) {
    const text = loadFullKb();
    cachedKb = text !== null ? { text } : null;
  }
  return cachedKb ? cachedKb.text : null;
}

/** Threshold (chars) under which the full KB is injected instead of BM25. */
export function kbSizeThreshold(): number {
  return Number(process.env.AI_KB_FULL_THRESHOLD ?? DEFAULT_KB_FULL_THRESHOLD);
}

export interface PromptOptions {
  userQuery: string;
  systemBase?: string;
}

/** The KB text to inject: the full KB while it fits, else the BM25 slice. */
function contextFor(userQuery: string, fullKb: string | null): string | null {
  if (fullKb === null) return null;
  if (fullKb.length <= kbSizeThreshold()) return fullKb; // full injection — 100% recall
  return retrieveRelevantContext(userQuery) || null; // BM25 fallback
}

/** Build the system prompt: base persona + action protocol + KB context. */
export function buildSystemPrompt(options: PromptOptions): string {
  const { userQuery, systemBase = SYSTEM_PROMPT_BASE } = options;
  const context = contextFor(userQuery, getFullKb());
  return context ? `${systemBase}\n\nRelevant context:\n${context}` : systemBase;
}
