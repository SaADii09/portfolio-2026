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
Be concise, friendly, and helpful. Use markdown sparingly (bold for emphasis).
If asked something outside your knowledge, say you don't know rather than making up an answer.
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

/** Build the system prompt: base persona + action protocol + KB context. */
export function buildSystemPrompt(options: PromptOptions): string {
  const { userQuery, systemBase = SYSTEM_PROMPT_BASE } = options;
  const threshold = kbSizeThreshold();
  const fullKb = getFullKb();

  let context: string | null = null;
  if (fullKb !== null) {
    if (fullKb.length <= threshold) {
      context = fullKb; // full injection — 100% recall
    } else {
      context = retrieveRelevantContext(userQuery) || null; // BM25 fallback
    }
  }

  return context ? `${systemBase}\n\nRelevant context:\n${context}` : systemBase;
}
