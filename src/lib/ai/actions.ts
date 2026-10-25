import { resolveAppId, THEME_DEFS, WIDGET_DEFS } from "@/lib/apps";
import { projectBySlug } from "@/lib/portfolio-data";
import type { MusicAction } from "@/lib/os-actions";

/**
 * Action-marker protocol (spec §Action protocol) — PURE and isomorphic.
 * The model emits `[[action:<verb>:<arg>]]` text markers; this module parses
 * them out of the answer into `ActionRef`s. Deliberately imports NO store or
 * os-actions runtime code (the server route imports it), so verb/arg
 * validation must live here too. Execution lives in the client-only
 * `actions-client.ts`.
 */

/**
 * The closed v1 verb table — every marker verb the model may use, in the
 * order documented by `ACTIONS_DOCS` below (kept next to the table so the
 * prompt and the parser can never drift).
 */
export const CHAT_ACTION_VERBS = [
  "open_app",
  "open_project",
  "set_theme",
  "music",
  "toggle_widget",
] as const;

export type ChatActionVerb = (typeof CHAT_ACTION_VERBS)[number];

export interface ActionRef {
  verb: ChatActionVerb;
  arg?: string;
}

/**
 * Literal marker instructions for the system prompt (consumed by
 * `prompt.ts`). Lists only the verbs and args the parser accepts — adding a
 * verb to `CHAT_ACTION_VERBS` without updating this string is caught by the
 * `chat-actions.test.ts` drift pins.
 */
export const ACTIONS_DOCS = `To act in the OS (open apps/projects, switch theme, control music, toggle widgets), emit EXACTLY one marker per action in the shape [[action:<verb>:<arg>]], on its own — never inside a sentence, never with improvised verbs or args:
[[action:open_app:<app>]] — app: about | projects | browser | control-panel | resume | terminal | contact (aliases: settings, cv)
[[action:open_project:<slug>]] — project slug: devos | ai-job-portal | saas-crm | api-automation
[[action:set_theme:<name>]] — name: retro | neon | editorial
[[action:music:<action>]] — action: play | pause | toggle | next | prev
[[action:toggle_widget:<type>]] — type: weather | cpu | music | notes
Rule: when the visitor asks you to DO something in the OS (open/show an app or project, switch the theme, play/pause music, toggle a widget), ALWAYS emit the matching marker — never merely describe or promise the action in words. One marker per requested action, each on its own line, then answer briefly.
Markers are parsed and executed automatically; answer normally alongside them.`;

/** Every legal `music` arg — mirrors `MusicAction` in `os-actions.ts`. */
const MUSIC_ACTIONS: readonly MusicAction[] = ["play", "pause", "toggle", "next", "prev"];

/** Per-verb arg validation against the closed domain tables (args arrive lowercased). */
const ARG_VALIDATORS: Record<ChatActionVerb, (arg: string) => boolean> = {
  open_app: (arg) => resolveAppId(arg) !== null,
  open_project: (arg) => projectBySlug(arg) !== undefined,
  set_theme: (arg) => THEME_DEFS.some((t) => t.name === arg),
  music: (arg) => MUSIC_ACTIONS.includes(arg as MusicAction),
  toggle_widget: (arg) => WIDGET_DEFS.some((w) => w.type === arg),
};

/**
 * A complete marker span: `[[` + optional whitespace + `action` + anything
 * up to the closing `]]` (no `]` inside). Case-insensitive and
 * whitespace-lenient on purpose (models mangle); the interior is parsed
 * strictly. Non-marker bracket text (`[[draft 1]]`) never matches, so it
 * survives untouched. Linear: the negated class can't cross a `]`, so there
 * is no nested quantifier to backtrack into.
 */
const MARKER_SPAN = /\[\[\s*action\b[^\][]*\]\]/gi;

/**
 * Held-back tail guard (spec): an unterminated `[[…` run at the END of the
 * buffer — no `]` or `[` inside — is a marker still streaming in. Its tail is
 * held back from `text` and reported via `openPartial` instead of leaking a
 * half-marker into the rendered message.
 */
const PARTIAL_TAIL = /\[\[[^\]\[]*$/;

/** The i-th marker token, normalized (`""` when missing) — one place for the indexed-access guard. */
function tokenAt(parts: string[], index: number): string {
  const raw = parts[index];
  return (raw ?? "").trim().toLowerCase();
}

/**
 * Tokenize one whole `[[action:verb:arg]]` span into its `verb`/`arg` parts
 * (lowercased); null = wrong shape (not exactly `action:verb:arg`).
 */
function splitMarkerParts(span: string): { verb: string; arg: string } | null {
  const parts = span.slice(2, -2).split(":");
  if (parts.length !== 3) return null;
  if (tokenAt(parts, 0) !== "action") return null;
  return { verb: tokenAt(parts, 1), arg: tokenAt(parts, 2) };
}

/** Validate a tokenized `verb`/`arg` pair against the closed tables; null = unknown → dropped. */
function validateVerbArg(verb: string, arg: string): ActionRef | null {
  if (!arg || !isChatActionVerb(verb)) return null;
  if (!ARG_VALIDATORS[verb](arg)) return null;
  return { verb, arg };
}

/** Parse one whole `[[action:verb:arg]]` span; null = malformed/unknown → dropped. */
function parseMarker(span: string): ActionRef | null {
  const parts = splitMarkerParts(span);
  return parts ? validateVerbArg(parts.verb, parts.arg) : null;
}

function isChatActionVerb(value: string): value is ChatActionVerb {
  return (CHAT_ACTION_VERBS as readonly string[]).includes(value);
}

export interface ExtractedChatActions {
  text: string;
  actions: ActionRef[];
  /** A marker may still be streaming in (held-back tail) — try again later. */
  openPartial: boolean;
}

/**
 * Pull action markers out of assistant content.
 *
 * - Valid markers are extracted (document order) and STRIPPED from `text`.
 * - Malformed markers (unknown verb, unknown arg, bad shape) are dropped and
 *   stripped — they never reach the user's eyes.
 * - Non-marker bracket text passes through unchanged.
 * - An unterminated `[[…` tail is held back and reported (`openPartial`).
 *
 * IDEMPOTENT and linear: re-running on the returned `text` is a no-op, and
 * the two passes are bounded scans (no nested quantifiers — the sanitizer
 * ReDoS lesson applies to this parser too).
 */
export function extractChatActions(content: string): ExtractedChatActions {
  const held = PARTIAL_TAIL.exec(content);
  const openPartial = held !== null;
  const head = held ? content.slice(0, held.index) : content;

  const actions: ActionRef[] = [];
  const text = head.replace(MARKER_SPAN, (span) => {
    const ref = parseMarker(span);
    if (ref) actions.push(ref);
    return "";
  });

  return { text, actions, openPartial };
}
