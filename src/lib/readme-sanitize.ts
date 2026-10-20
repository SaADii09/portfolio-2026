/**
 * README HTML sanitizer — a defensive layer over GitHub's own sanitization.
 *
 * Pure string transforms via `String.replace`; no HTML parser dependency.
 * GitHub already sanitizes rendered README HTML, so this targets the pinned
 * transforms rather than a full HTML grammar (known-safe for common README
 * shapes; limitations noted inline). Task 4 (route) and Task 8 (ReadmeView)
 * both call this — belt and suspenders.
 *
 * Tag scanning is quote-aware: a `>` inside a quoted attribute value does
 * not terminate the tag, and on* handlers separated by `/` are stripped, so
 * no re-parse of the output can surface a live event handler. Remaining
 * known-safe-for-README-shapes gaps (covered upstream by GitHub):
 * blocked-element text content that itself contains a literal closing tag
 * sequence; paint properties ending in something other than `-color`/
 * `-image` (e.g. `border-image-source`); attribute values that contain an
 * `/on…=` sequence (over-stripped, fail-closed direction); odd backtick
 * quoting tricks targeted at legacy engines.
 */

/** Block-level elements removed together with everything inside them. */
const BLOCKED_WITH_CONTENTS = ["script", "iframe", "object", "form"] as const;

/** Void elements removed tag-only (no closing tag exists). */
const BLOCKED_VOID = ["embed"] as const;

/**
 * Style declarations that must never reach the DOM. Paint-capable families:
 * `color` and `background` shorthands, and any property whose name ends in
 * `-color`/`-image` (border/outline/list-style/mask paint, etc.). An optional
 * leading vendor prefix (`-webkit-`, `-o-`, …) is stripped before matching,
 * so `-webkit-background-image` is caught. `column-count` deliberately does
 * not match (see `unprefixedName` + pinned tests).
 */
const BLOCKED_STYLE_DECLARATION = /^\s*(?:color|background|[\w-]*-(?:color|image))\s*:/i;

/** Matches a single attribute value: double-quoted, single-quoted, or bare. */
const ATTRIBUTE_VALUE = String.raw`("[^"]*"|'[^']*'|[^\s>]+)`;

/** ` onclick="..."` / `<img/onerror=x>` — [\s/]: both are attr separators
 * inside a tag, and this anchor keeps `data-onclick` safe. */
const ON_ATTRIBUTE = new RegExp(String.raw`[\s/]on[a-z]+\s*=\s*` + ATTRIBUTE_VALUE, "gi");

/** ` color:red` inside a tag (only consumed when filtered). */
const STYLE_ATTRIBUTE = new RegExp(String.raw`\sstyle\s*=\s*` + ATTRIBUTE_VALUE, "gi");

const TARGET_ATTRIBUTE = new RegExp(String.raw`\starget\s*=\s*` + ATTRIBUTE_VALUE, "gi");

const REL_ATTRIBUTE = new RegExp(String.raw`\srel\s*=\s*` + ATTRIBUTE_VALUE, "gi");

/**
 * Quote-aware tag body: inside a tag, a `>` only closes the tag when no
 * quoted attribute value is open, so quoted spans (`"…"`, `'…'`) are
 * consumed whole and every other character (including stray quotes) is
 * skipped until the first unquoted `>`. Mutually exclusive alternatives make
 * this safe from catastrophic backtracking.
 */
const QUOTE_AWARE_TAIL = String.raw`(?:"[^"]*"|'[^']*'|[^>])*`;

/** Tags only: `<p ...>`, `<br/>`, `<A HREF>` — not comments or closers. */
const OPEN_TAG = new RegExp(String.raw`<[a-zA-Z]` + QUOTE_AWARE_TAIL + `>`, "g");

const ANCHOR_TAG = /^<a[\s>/]/i;

/** Canonical pair `<open>...</open>` for a blocked tag. */
function elementPairRegExp(tag: string): RegExp {
  return new RegExp(
    String.raw`<${tag}\b` + QUOTE_AWARE_TAIL + String.raw`>[\s\S]*?<\/${tag}\s*>`,
    "gi",
  );
}

/** A lone opener (`closing === false`) or closer of a blocked tag. */
function orphanTagRegExp(tag: string, closing: boolean): RegExp {
  return closing
    ? new RegExp(String.raw`<\/${tag}\s*>`, "gi")
    : new RegExp(String.raw`<${tag}\b` + QUOTE_AWARE_TAIL + `>`, "gi");
}

/** Strips a leading vendor prefix (`-webkit-`, `-o-`, …) from a
 * declaration, so prefixed paint properties (`-webkit-background-image`)
 * are classified like their unprefixed names. */
function unprefixedName(declaration: string): string {
  return declaration.replace(/^\s*-[a-z0-9]+-/i, "");
}

/** True when the (prefix-stripped) declaration paints color/image —
 * `color`, `background`, or any `*-color`/`*-image` property. */
export function isBlockedStyleDeclaration(declaration: string): boolean {
  return BLOCKED_STYLE_DECLARATION.test(unprefixedName(declaration));
}

/**
 * Strips blocked declarations from one style value and keeps the rest.
 * Note: a trailing `;` yields an empty tail part whose join collapses to ""
 * — caller treats "" as "no style attribute at all", which is safe.
 */
export function removeBlockedStyleDeclarations(value: string): string {
  const kept = value.split(";").filter((part) => !isBlockedStyleDeclaration(part));
  return kept
    .map((part) => part.trim())
    .filter(Boolean)
    .join(";");
}

/** Unwraps a quoted attribute value captured by the shared value regex. */
function attributeValueOf(raw: string): string {
  if (raw.startsWith('"') || raw.startsWith("'")) return raw.slice(1, -1);
  return raw;
}

/** Rewrites one style attribute, dropping blocked declarations. */
function filterStyleAttribute(tag: string): string {
  return tag.replace(STYLE_ATTRIBUTE, (_match, raw) => {
    const cleaned = removeBlockedStyleDeclarations(attributeValueOf(raw));
    if (cleaned.length === 0) return "";
    return String.raw` style="${cleaned.replaceAll('"', "'")}"`;
  });
}

/** Removes every on* event-handler attribute from one tag. */
function stripOnAttributes(tag: string): string {
  return tag.replace(ON_ATTRIBUTE, "");
}

/** Forces target="_blank" rel="noopener noreferrer" onto an anchor tag. */
function normalizeAnchor(tag: string): string {
  const stripped = tag.replace(TARGET_ATTRIBUTE, "").replace(REL_ATTRIBUTE, "");
  const forced = String.raw` target="_blank" rel="noopener noreferrer"`;
  return stripped.endsWith("/>")
    ? stripped.slice(0, -2) + forced + " />"
    : stripped.slice(0, -1) + forced + ">";
}

/** Applies every per-tag transform to a single open tag. */
function sanitizeOpenTag(tag: string): string {
  let next = stripOnAttributes(tag);
  next = filterStyleAttribute(next);
  if (ANCHOR_TAG.test(next)) next = normalizeAnchor(next);
  return next;
}

function removeVoidTag(html: string, tag: string): string {
  return html.replace(orphanTagRegExp(tag, false), "");
}

/**
 * Removes an element and its contents. The pair regex is non-greedy, so a
 * nested same-tag element leaves a stray closer behind, which the second
 * strip then removes; unclosed openers are dropped the same way. (Contents
 * containing a literal `</tag>` in a script string are a known-shape gap
 * covered by GitHub's upstream sanitization.)
 */
function removeElementWithContents(html: string, tag: string): string {
  return html
    .replace(elementPairRegExp(tag), "")
    .replace(orphanTagRegExp(tag, false), "")
    .replace(orphanTagRegExp(tag, true), "");
}

function removeBlockedElements(html: string): string {
  let next = html;
  for (const tag of BLOCKED_WITH_CONTENTS) next = removeElementWithContents(next, tag);
  for (const tag of BLOCKED_VOID) next = removeVoidTag(next, tag);
  return next;
}

/**
 * Removes <script>/<iframe>/<object>/<form> (with contents) and <embed>,
 * strips color/background style declarations, deletes on* attributes, and
 * forces target/rel on anchors. Everything else passes through.
 */
export function sanitizeReadmeHtml(html: string): string {
  const stripped = removeBlockedElements(html);
  return stripped.replace(OPEN_TAG, sanitizeOpenTag);
}
