export const THEME_NAMES = ["retro", "neon", "editorial"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export interface ThemeTokens {
  "bg-primary": string;
  "bg-secondary": string;
  "bg-tertiary": string;
  "accent-1": string;
  "accent-2": string;
  "accent-3": string;
  "text-primary": string;
  "text-secondary": string;
  border: string;
  shadow: string;
  radius: string;
  "font-display": string;
  "font-body": string;
  "window-border-width": string;
  "taskbar-height": string;
}

export const THEMES: Record<ThemeName, ThemeTokens> = {
  retro: {
    "bg-primary": "#2d1b14",
    "bg-secondary": "#4a3728",
    "bg-tertiary": "#6b5344",
    "accent-1": "#ff9f1c",
    "accent-2": "#ffbf00",
    "accent-3": "#2ec4b6",
    "text-primary": "#fff8e7",
    "text-secondary": "#d4a373",
    border: "#ff9f1c",
    shadow: "8px 8px 0px #1a0f0a",
    radius: "0px",
    "font-display": '"Press Start 2P", cursive',
    "font-body": '"VT323", monospace',
    "window-border-width": "4px",
    "taskbar-height": "48px",
  },
  neon: {
    "bg-primary": "#0a0a0f",
    "bg-secondary": "#12121a",
    "bg-tertiary": "#1a1a2e",
    "accent-1": "#00f5ff",
    "accent-2": "#ff00ff",
    "accent-3": "#39ff14",
    "text-primary": "#e0e0e0",
    "text-secondary": "#a0a0b0",
    border: "rgba(0, 245, 255, 0.4)",
    shadow: "0 0 20px rgba(0, 245, 255, 0.15)",
    radius: "12px",
    "font-display": '"Orbitron", sans-serif',
    "font-body": '"Rajdhani", sans-serif',
    "window-border-width": "1px",
    "taskbar-height": "52px",
  },
  editorial: {
    "bg-primary": "#eeefe9",
    "bg-secondary": "#e5e7e0",
    "bg-tertiary": "#ffffff",
    "accent-1": "#f7a501",
    "accent-2": "#23251d",
    "accent-3": "#2c84e0",
    "text-primary": "#23251d",
    "text-secondary": "#4d4f46",
    border: "#bfc1b7",
    shadow: "none",
    radius: "6px",
    "font-display": '"IBM Plex Sans", sans-serif',
    "font-body": '"IBM Plex Sans", sans-serif',
    "window-border-width": "1px",
    "taskbar-height": "44px",
  },
};

export const TAILWIND_TOKEN_MAP: Record<string, string> = {
  "bg-os-bg": "var(--bg-primary)",
  "bg-os-surface": "var(--bg-secondary)",
  "bg-os-surface-alt": "var(--bg-tertiary)",
  "bg-os-accent": "var(--accent-1)",
  "text-os-text": "var(--text-primary)",
  "text-os-muted": "var(--text-secondary)",
  "text-os-accent": "var(--accent-1)",
  "border-os-border": "var(--border)",
  "rounded-os": "var(--radius)",
  "shadow-os": "var(--shadow)",
  "font-display": "var(--font-display)",
  "font-body": "var(--font-body)",
};

export const ALLOWED_INLINE_STYLE_PROPS = new Set([
  "left",
  "top",
  "width",
  "height",
  "opacity",
  "zIndex",
  "z-index",
  "transform",
  "transition",
  "animation",
]);

export const DYNAMIC_COLOR_CONTEXTS = new Set([
  "globals.css",
  "themes.ts",
  "design-tokens.ts",
  "tailwind.config.ts",
  // OG image is not a themed surface (no CSS cascade) — documented exception
  "opengraph-image.tsx",
  // Canvas wallpaper paints raw theme palettes in 2D contexts — no CSS
  // cascade applies to ctx.fillStyle/strokeStyle, so tokens are meaningless
  // there and the per-theme palette values are intentional literals.
  "Wallpaper.tsx",
]);

/**
 * Swatch colors for the theme selector chips (desktop control center and
 * mobile pull-down). Centralized so TopBar and the design validator share one
 * source of truth instead of the validator flagging the literals in TopBar.
 */
export const THEME_CHIP_COLORS: Record<ThemeName, string> = {
  retro: "#ff9f1c",
  neon: "#ff00ff",
  editorial: "#f7a501",
};

// ── Widened color-literal checking ───────────────────
//
// The old inline re in the validator blinded itself to every quoted literal
// (a `(?<!['"`])` lookbehind) and skipped whole lines carrying `//`, so
// `color: "#ff9f1c"` was never reported. The checks now live here as pure
// predicates shared with `scripts/validate-design.ts` (which keeps its own
// `main()`/`process.exit()` logic — never import that script into vitest).

/**
 * Matches color literals with no guard against adjacent quotes: the widened
 * check must surface literals inside quoted strings too. Covers 3/6/8-digit
 * hex, rgb(a) and hsl(a). Global flag for `matchAll` consumption.
 */
export const COLOR_LITERAL_RE: RegExp =
  /(#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;

function isHexString(body: string): boolean {
  return /^[a-fA-F0-9]+$/.test(body);
}

function hasNoColorMatch(line: string): boolean {
  // Fresh, flag-free regex: the shared `g` flag carries `lastIndex` state a
  // bare `.test()` would leak across calls.
  return !new RegExp(COLOR_LITERAL_RE.source).test(line);
}

/**
 * Masks URL strings and non-hex `#fragment` strings for checking purposes.
 * A fragment whose body IS valid hex (`#face` — chars [a-fA-F0-9]) is left
 * untouched so the widened check still sees it. Comment contexts are masked
 * too, so a literal is judged by the code text around it, not its whole line.
 */
export function stripNonColorContexts(line: string): string {
  let rest = line.replace(/['"`](?:https?:)?\/\/[^'"`]*['"`]/g, "");
  // Quoted `#…` fragments: mask unless the body is valid hex
  rest = rest.replace(/['"`](#[^'"`]*)['"`]/g, (frag, body: string) =>
    isHexString(body.slice(1)) ? frag : "",
  );
  // Block comment pairs, then a lone `/*` comment tail
  rest = rest.replace(/\/\*[\s\S]*?\*\/|\/\*.*$/g, "");
  // Line-comment tail (bare `//` only — quoted URLs are already masked)
  rest = rest.replace(/\/\/.*$/g, "");
  return rest;
}

/**
 * True when a line carries the per-line exemption marker
 * `// design-token-exempt: <reason>` pinned by the design spec.
 */
export function hasTokenExemptMarker(line: string): boolean {
  return line.includes("// design-token-exempt:");
}

/**
 * True iff every widened-color match on the line survives the stripping /
 * marker checks — i.e. nothing here is a bare code-context color literal.
 */
export function isAllowedColorLiteral(line: string): boolean {
  if (hasTokenExemptMarker(line)) return true;
  return hasNoColorMatch(stripNonColorContexts(line));
}

export function isHardcodedColor(value: string): boolean {
  return (
    /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.test(value) ||
    /^rgb(a)?\(/.test(value) ||
    /^hsl(a)?\(/.test(value)
  );
}
