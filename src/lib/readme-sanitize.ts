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
 * not terminate the tag. Every attribute rule anchors on the *separator*
 * that precedes the attribute name and re-emits it — the HTML tokenizer
 * lets an attribute follow a quoted value with no separator at all
 * (`<img alt="x"onerror=alert(1)>`), so a rule that demands whitespace
 * waves that handler through, and a rule that swallows the separator
 * unbalances the previous value. No re-parse of the output can surface a
 * live event handler.
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
 * Attribute separator: whitespace, `/` (both separate attributes inside a
 * tag) or the quote that closes a previous quoted value — the HTML
 * tokenizer allows an attribute to follow a quoted value with no separator
 * at all. Captured so it can be re-emitted instead of swallowed.
 */
const SEPARATOR = String.raw`([\s/"'])`;

/** ` onclick="..."` / `<img/onerror=x>` — the separator class covers the
 *  whitespace, `/` and quote-adjacent shapes; this anchor keeps
 *  `data-onclick` safe. */
const ON_ATTRIBUTE = new RegExp(SEPARATOR + String.raw`on[a-z]+\s*=\s*` + ATTRIBUTE_VALUE, "gi");

/** ` color:red` inside a tag (only consumed when filtered). */
const STYLE_ATTRIBUTE = new RegExp(SEPARATOR + String.raw`style\s*=\s*` + ATTRIBUTE_VALUE, "gi");

const TARGET_ATTRIBUTE = new RegExp(SEPARATOR + String.raw`target\s*=\s*` + ATTRIBUTE_VALUE, "gi");

const REL_ATTRIBUTE = new RegExp(SEPARATOR + String.raw`rel\s*=\s*` + ATTRIBUTE_VALUE, "gi");

/** Attributes the browser resolves as a URL. The name group is
 *  non-capturing so every attribute pattern has the same shape: the
 *  separator (group 1) and the value (group 2). */
const URL_ATTRIBUTE = new RegExp(
  SEPARATOR + String.raw`(?:xlink:href|href|src|formaction)\s*=\s*` + ATTRIBUTE_VALUE,
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

/** A character that may legally follow an attribute without a separator. */
const TOKEN_BOUNDARY = /[\s/>]/;

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

/**
 * The separator that must survive an attribute rewrite: a quote separator
 * closes the previous attribute's value, so it is re-emitted verbatim;
 * whitespace and `/` separators are consumed because the rewritten
 * attribute brings its own spacing.
 */
function separatorEcho(sep: string): string {
  return sep === '"' || sep === "'" ? sep : "";
}

/**
 * A separator is required when the next token is glued to the attribute
 * that was just removed (`<a href="x"target="_y">`) — otherwise the
 * removal would splice the tag name onto the next attribute.
 */
function separatorFill(next: string | undefined): string {
  if (next === undefined) return "";
  return TOKEN_BOUNDARY.test(next) ? "" : " ";
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
 * Removes every match of an attribute pattern from a tag, keeping the token
 * boundary intact: the separator before the attribute is consumed, but a
 * separator is re-inserted when the next token is glued to it.
 */
function dropAttribute(tag: string, pattern: RegExp): string {
  return tag.replace(
    pattern,
    (match, sep: string, _value: string, offset: number, whole: string) => {
      return separatorEcho(sep) + separatorFill(whole[offset + match.length]);
    },
  );
}

/** Rewrites one style attribute, dropping blocked declarations. */
function filterStyleAttribute(tag: string): string {
  return tag.replace(
    STYLE_ATTRIBUTE,
    (match, sep: string, raw: string, offset: number, whole: string) => {
      const cleaned = removeBlockedStyleDeclarations(attributeValueOf(raw));
      const fill = separatorFill(whole[offset + match.length]);
      if (cleaned.length === 0) return separatorEcho(sep) + fill;
      return `${separatorEcho(sep)} style="${cleaned.replaceAll('"', "'")}"${fill}`;
    },
  );
}

/** Removes URL attributes the browser must not follow. */
function filterUrlAttributes(tag: string): string {
  return tag.replace(
    URL_ATTRIBUTE,
    (match, sep: string, raw: string, offset: number, whole: string) => {
      if (isSafeUrl(raw)) return match;
      return separatorEcho(sep) + separatorFill(whole[offset + match.length]);
    },
  );
}

/** Forces target="_blank" rel="noopener noreferrer" onto an anchor tag. */
function normalizeAnchor(tag: string): string {
  const stripped = dropAttribute(dropAttribute(tag, TARGET_ATTRIBUTE), REL_ATTRIBUTE);
  const forced = String.raw` target="_blank" rel="noopener noreferrer"`;
  return stripped.endsWith("/>")
    ? stripped.slice(0, -2) + forced + " />"
    : stripped.slice(0, -1) + forced + ">";
}

/** Applies every per-tag transform to a single open tag. */
function sanitizeOpenTag(tag: string): string {
  let next = dropAttribute(tag, ON_ATTRIBUTE);
  next = filterStyleAttribute(next);
  next = filterUrlAttributes(next);
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
 * Removes <script>/<iframe>/<object>/<form>/<style> (with contents) and
 * <embed>/<link>/<base>/<meta>, strips color/background style declarations,
 * deletes on* attributes, drops URL attributes with an unsafe scheme, and
 * forces target/rel on anchors. Everything else passes through.
 */
export function sanitizeReadmeHtml(html: string): string {
  const stripped = removeBlockedElements(html);
  return stripped.replace(OPEN_TAG, sanitizeOpenTag);
}
