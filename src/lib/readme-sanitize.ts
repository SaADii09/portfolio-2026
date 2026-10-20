/**
 * README HTML sanitizer — a defensive layer over GitHub's own sanitization.
 *
 * Pure string transforms via `String.replace`; no HTML parser dependency.
 * GitHub already sanitizes rendered README HTML, so this targets the pinned
 * transforms rather than a full HTML grammar (known-safe for common README
 * shapes; limitations noted inline). Task 4 (route) and Task 8 (ReadmeView)
 * both call this — belt and suspenders.
 *
 * Two invariants drive the design:
 *
 * 1. **No live handler.** Every attribute rule matches on the attribute NAME
 *    and asserts a boundary in front of it with a fixed-width lookbehind, so
 *    it consumes nothing before the name. The HTML tokenizer lets an
 *    attribute follow a quoted value with no separator at all
 *    (`<img alt="x"onerror=alert(1)>`) and lets a second attribute follow
 *    the first one (`<img onerror="x"onload="alert(1)">`). A rule that
 *    consumed the separator would hand the next attribute a head start it
 *    never gets back — the scan resumes after the consumed separator and
 *    the packed attribute is never visited. Matching the name alone visits
 *    EVERY attribute, packed or not.
 * 2. **No paint and no forced attribute lost to a duplicate.** A tag the
 *    quote-aware scanner cannot close (an unpaired quote) is removed rather
 *    than passed through — the browser still reads it as a tag, so leaving
 *    it would leak its attributes. The forced `target`/`rel` pair is
 *    appended only after every `target`/`rel` in the tag has been removed,
 *    so exactly one of each survives and the browser cannot honour a
 *    duplicate that came first.
 *
 * URLs are scheme-checked: only `http:`, `https:`, `mailto:`, `tel:` and
 * relative / fragment / protocol-relative references survive. Elements
 * that can restyle the window, pull in a remote asset, re-point the
 * document or navigate it (`style`, `link`, `base`, `meta`) are removed
 * outright.
 *
 * Remaining known-safe-for-README-shapes gaps (covered upstream by GitHub):
 * blocked-element text content that itself contains a literal closing tag
 * sequence; paint properties ending in something other than `-color`/
 * `-image` (e.g. `border-image-source`); attribute values that contain an
 * `on…=` sequence (over-stripped, fail-closed direction — the value is
 * emptied, the element and the tag stay intact); odd backtick quoting
 * tricks targeted at legacy engines.
 */

/** Block-level elements removed together with everything inside them. */
const BLOCKED_WITH_CONTENTS = ["script", "iframe", "object", "form", "style"] as const;

/** Void elements removed tag-only (no closing tag exists). */
const BLOCKED_VOID = ["embed", "link", "base", "meta"] as const;

/**
 * Style declarations that must never reach the DOM. Paint-capable families:
 * `color` and `background` shorthands, and any property whose name ends in
 * `-color`/`-image` (border/outline/list-style/mask paint, etc.). An optional
 * leading vendor prefix (`-webkit-`, `-o-`, …) is stripped before matching,
 * so `-webkit-background-image` is caught. `column-count` deliberately does
 * not match (see `unprefixedName` + pinned tests).
 */
const BLOCKED_STYLE_DECLARATION = /^\s*(?:color|background|[\w-]*-(?:color|image))\s*:/i;

/**
 * Matches a single attribute value: double-quoted, single-quoted, or bare.
 * The bare form excludes quote characters so a value cannot swallow the
 * delimiter of the attribute that follows it.
 */
const ATTRIBUTE_VALUE = String.raw`("[^"]*"|'[^']*'|[^\s>"']+)`;

/**
 * The attribute name must not continue a word: `data-onclick` and
 * `xlink:href` keep their prefix, a real attribute name does not. The
 * lookbehind is fixed-width and consumes nothing in front of the name, so
 * the global scan always lands on the NEXT attribute.
 */
const ATTRIBUTE_BOUNDARY = String.raw`(?<![-\w])`;

/** Whitespace trailing an attribute value — consumed by the rules that drop
 *  an attribute, so the drop leaves no double gap behind. */
const TRAILING_SPACE = String.raw`\s*`;

/** `onclick="..."` / `<img/onerror=x>` — the boundary keeps `data-onclick`
 *  safe; the name may follow whitespace, `/` or a closing quote. */
const ON_ATTRIBUTE = new RegExp(
  ATTRIBUTE_BOUNDARY + String.raw`on[a-z]+\s*=\s*` + ATTRIBUTE_VALUE + TRAILING_SPACE,
  "gi",
);

/** `style="..."` inside a tag (only consumed when filtered). */
const STYLE_ATTRIBUTE = new RegExp(
  ATTRIBUTE_BOUNDARY + String.raw`style\s*=\s*` + ATTRIBUTE_VALUE + String.raw`(\s*)`,
  "gi",
);

const TARGET_ATTRIBUTE = new RegExp(
  ATTRIBUTE_BOUNDARY + String.raw`target\s*=\s*` + ATTRIBUTE_VALUE + TRAILING_SPACE,
  "gi",
);

const REL_ATTRIBUTE = new RegExp(
  ATTRIBUTE_BOUNDARY + String.raw`rel\s*=\s*` + ATTRIBUTE_VALUE + TRAILING_SPACE,
  "gi",
);

/** Attributes the browser resolves as a URL. The name group is
 *  non-capturing so every attribute pattern keeps one shape: the value. */
const URL_ATTRIBUTE = new RegExp(
  ATTRIBUTE_BOUNDARY +
    String.raw`(?:xlink:href|href|src|formaction)\s*=\s*` +
    ATTRIBUTE_VALUE +
    TRAILING_SPACE,
  "gi",
);

/** URL schemes a README may point at. */
const ALLOWED_SCHEME = /^(?:https?|mailto|tel):/i;

/** A URL that carries an explicit scheme (`javascript:`, `data:`, …). */
const EXPLICIT_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Characters a browser strips from a URL before it resolves the scheme. */
const URL_NOISE = /[\u0000-\u0020\u007f]/g;

/** Named references that can spell — or split — a URL scheme. */
const NAMED_REFERENCES: Record<string, string> = {
  colon: ":",
  newline: "\n",
  tab: "\t",
};

/**
 * Numeric character references (`&#58;`, `&#x3a;` — the numeric semicolon is
 * optional in HTML) plus the named references above. Every quantifier is
 * bounded, so the scan stays linear.
 */
const CHARACTER_REFERENCE = /&#x([0-9a-f]{1,6});?|&#([0-9]{1,7});?|&([a-z]{1,12});/gi;

/** True when a character is whitespace. */
const SPACE = /\s/;

/** True when a tag body already ends in whitespace. */
const TRAILING_SPACE_IN_TAG = /\s$/;

/**
 * Quote-aware tag body: inside a tag, a `>` only closes the tag when no
 * quoted attribute value is open. The three alternatives are exclusive on
 * their FIRST character (`"` / `'` / neither) and quote interiors allow all
 * characters except their own delimiter — `>` may occur inside a quoted
 * value, which is what keeps the quoted-`>` pin correct. Because every
 * character position has exactly one viable alternative, and a quote span's
 * interior length is pinned by the position of its closing delimiter, there
 * is no ambiguous decomposition — matching stays linear even on inputs that
 * never find a closing `>` (pinned by the bounded-time test).
 */
const QUOTE_AWARE_TAIL = String.raw`(?:"[^"]*"|'[^']*'|[^"'>])*`;

/** A tag whose quotes balance: the quote-aware tail finds its `>`. */
const WELL_FORMED_TAG = String.raw`<[a-zA-Z]` + QUOTE_AWARE_TAIL + `>`;

/**
 * A tag the quote-aware tail cannot close (an unpaired quote). The browser
 * still reads it as a tag, so it is cut at the first `>` and removed rather
 * than passed through with its attributes intact.
 */
const MALFORMED_TAG = String.raw`<[a-zA-Z][^>]*>`;

/**
 * Open tags only: `<p ...>`, `<br/>`, `<A HREF>` — not comments or closers.
 * The well-formed shape is processed; the malformed shape is dropped.
 */
const OPEN_TAG = new RegExp(String.raw`(` + WELL_FORMED_TAG + String.raw`)|` + MALFORMED_TAG, "g");

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

/** The character for a numeric reference, or the raw text when the code
 *  point is out of range. */
function codePointOf(value: number, fallback: string): string {
  if (value < 0 || value > 0x10ffff) return fallback;
  return String.fromCodePoint(value);
}

/**
 * Resolves the character references a browser resolves while parsing an
 * attribute value, so a scheme cannot hide behind `&#58;` or `&Tab;`.
 */
function decodeReferences(value: string): string {
  return value.replace(CHARACTER_REFERENCE, (match, hex: string, dec: string, name: string) => {
    if (hex) return codePointOf(parseInt(hex, 16), match);
    if (dec) return codePointOf(parseInt(dec, 10), match);
    return NAMED_REFERENCES[name.toLowerCase()] ?? match;
  });
}

/** A relative, fragment or protocol-relative reference — no scheme to read. */
function isRelativeReference(value: string): boolean {
  return value.startsWith("//") || value.startsWith("/") || value.startsWith("#");
}

/**
 * True when the browser may follow the URL: an allowed scheme, or a
 * relative, fragment or protocol-relative reference. Browsers strip
 * whitespace and control characters from a URL and decode character
 * references while parsing the attribute, so both are normalized before
 * the scheme is read.
 */
function isSafeUrl(raw: string): boolean {
  const value = decodeReferences(attributeValueOf(raw)).replace(URL_NOISE, "");
  if (ALLOWED_SCHEME.test(value)) return true;
  if (isRelativeReference(value)) return true;
  return !EXPLICIT_SCHEME.test(value);
}

/**
 * Rewrites one style attribute, dropping blocked declarations. The
 * attribute keeps its place in the tag — the leading spacing is untouched
 * and the trailing spacing is re-emitted — so a rewrite never glues the
 * next attribute to this one.
 */
function filterStyleAttribute(tag: string): string {
  return tag.replace(STYLE_ATTRIBUTE, (_match, raw: string, trailing: string) => {
    const cleaned = removeBlockedStyleDeclarations(attributeValueOf(raw));
    if (cleaned.length === 0) return "";
    return `style="${cleaned.replaceAll('"', "'")}"${trailing}`;
  });
}

/** Removes URL attributes the browser must not follow. */
function filterUrlAttributes(tag: string): string {
  return tag.replace(URL_ATTRIBUTE, (match, raw: string) => (isSafeUrl(raw) ? match : ""));
}

/**
 * Forces target="_blank" rel="noopener noreferrer" onto an anchor tag.
 * Every `target`/`rel` in the tag is dropped first, so the forced pair is
 * the only one the browser can honour — a duplicate that came first would
 * otherwise win. The pair carries its own leading separator only when the
 * tag does not already end in whitespace, so a dropped attribute never
 * leaves a double gap.
 */
function normalizeAnchor(tag: string): string {
  const stripped = tag.replace(TARGET_ATTRIBUTE, "").replace(REL_ATTRIBUTE, "");
  const selfClosing = stripped.endsWith("/>");
  const body = selfClosing ? stripped.slice(0, -2) : stripped.slice(0, -1);
  const separator = TRAILING_SPACE_IN_TAG.test(body) ? "" : " ";
  const forced = `${separator}target="_blank" rel="noopener noreferrer"`;
  return selfClosing ? `${body}${forced} />` : `${body}${forced}>`;
}

/** Walks back over the whitespace that ends at `from`. */
function walkBackOverSpaces(tag: string, from: number): number {
  let index = from;
  while (index > 0 && SPACE.test(tag.charAt(index - 1))) index -= 1;
  return index;
}

/**
 * Removes the whitespace a dropped attribute can leave in front of the
 * tag's closing bracket. A hand-rolled scan: a regular expression would
 * rescan the whitespace run from every position, which is quadratic on a
 * tag that carries a long run of spaces.
 */
function trimTrailingSpace(tag: string): string {
  const close = tag.endsWith("/>") ? tag.length - 2 : tag.length - 1;
  const start = walkBackOverSpaces(tag, close);
  return start === close ? tag : tag.slice(0, start) + tag.slice(close);
}

/** Applies every per-tag transform to a single open tag. */
function sanitizeOpenTag(tag: string): string {
  let next = tag.replace(ON_ATTRIBUTE, "");
  next = filterStyleAttribute(next);
  next = filterUrlAttributes(next);
  if (ANCHOR_TAG.test(next)) next = normalizeAnchor(next);
  return trimTrailingSpace(next);
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
 * Removes <script>/<iframe>/<object>/<form>/<style> (with contents) and
 * <embed>/<link>/<base>/<meta>, strips color/background style declarations,
 * deletes on* attributes, drops URL attributes with an unsafe scheme, drops
 * tags it cannot parse, and forces target/rel on anchors. Everything else
 * passes through.
 */
export function sanitizeReadmeHtml(html: string): string {
  const stripped = removeBlockedElements(html);
  return stripped.replace(OPEN_TAG, (match, wellFormed: string | undefined) =>
    wellFormed === undefined ? "" : sanitizeOpenTag(wellFormed),
  );
}
