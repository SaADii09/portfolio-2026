import { describe, expect, it } from "vitest";
import {
  COLOR_LITERAL_RE,
  stripNonColorContexts,
  hasTokenExemptMarker,
  isAllowedColorLiteral,
} from "../../lib/design-tokens";

/**
 * Unit tests for the widened color-literal checker predicates. These import
 * ONLY from `lib/design-tokens.ts` — never `scripts/validate-design.ts`, which
 * runs `main()` at module top level and calls `process.exit()`.
 */
describe("widened color-literal checker", () => {
  it("finds a quoted hex literal that the old lookbehind missed", () => {
    const line = 'color: "#ff9f1c"';
    const matches = [...line.matchAll(COLOR_LITERAL_RE)].map((m) => m[0]);
    expect(matches).toContain("#ff9f1c");
    expect(isAllowedColorLiteral(line)).toBe(false);
  });

  it("treats a valid-hex fragment as a color, not a URL fragment", () => {
    // `#face` IS hex (chars [a-fA-F0-9]) — the fragment strip must NOT
    // swallow it, so the widened check still sees such bodies.
    expect(stripNonColorContexts('"#face"')).toContain("#face");
    expect(isAllowedColorLiteral('link: "#abcdef"')).toBe(false);
  });

  it("skips quoted non-hex #fragments (anchors)", () => {
    expect(isAllowedColorLiteral('link "#section"')).toBe(true);
    expect(stripNonColorContexts('"#section"')).not.toContain("#section");
  });

  it("skips quoted URLs — even when they embed a fragment", () => {
    expect(isAllowedColorLiteral('fetch("https://example.com/a#b")')).toBe(true);
    expect(isAllowedColorLiteral('url("https://cdn.example.com/img.png")')).toBe(true);
  });

  it("allows a line carrying the design-token-exempt marker", () => {
    const line = 'fillStyle: "#ff4444", // design-token-exempt: canvas paint';
    expect(hasTokenExemptMarker(line)).toBe(true);
    expect(isAllowedColorLiteral(line)).toBe(true);
  });

  it("matches rgba/hsl quoted and unquoted", () => {
    for (const line of [
      "rgba(255, 0, 0, 0.5)",
      '"rgba(255 0 0 / 0.5)"',
      '"hsl(120, 50%, 50%)"',
      "hsla(240, 100%, 50%, 0.8)",
    ]) {
      expect([...line.matchAll(COLOR_LITERAL_RE)]).not.toHaveLength(0);
      expect(isAllowedColorLiteral(line)).toBe(false);
    }
  });

  it("does not skip a bare color match that merely shares its line with a comment", () => {
    // The old blanket `lineContent.includes("//")` skip was removed; only the
    // match itself sitting inside a comment/URL context counts.
    const line = 'background: "#ff0000"; // selected accent';
    expect(isAllowedColorLiteral(line)).toBe(false);
  });

  it("sees uppercase literals — case-insensitivity must match the widened regex", () => {
    // COLOR_LITERAL_RE is `gi`; the allowed-context probe must be case-insensitive
    // too, else uppercase literals silently pass the widened gate.
    const upperHex = 'color: "#FF4D6D"';
    const upperFn = "value: RGBA(16, 185, 129)";
    const firstMatch = [...upperHex.matchAll(COLOR_LITERAL_RE)][0];
    expect(firstMatch?.[0]).toBe("#FF4D6D");
    expect(isAllowedColorLiteral(upperHex)).toBe(false);
    expect(isAllowedColorLiteral(upperFn)).toBe(false);
  });
});
