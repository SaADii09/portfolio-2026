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
    "bg-primary": "#f5f0e8",
    "bg-secondary": "#ede8e0",
    "bg-tertiary": "#e5e0d8",
    "accent-1": "#1a1a1a",
    "accent-2": "#8b4513",
    "accent-3": "#2f4f4f",
    "text-primary": "#1a1a1a",
    "text-secondary": "#4a4a4a",
    border: "#d4cfc7",
    shadow: "0 4px 24px rgba(0, 0, 0, 0.08)",
    radius: "4px",
    "font-display": '"Crimson Pro", serif',
    "font-body": '"Inter", sans-serif',
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
]);

export function isHardcodedColor(value: string): boolean {
  return (
    /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.test(value) ||
    /^rgb(a)?\(/.test(value) ||
    /^hsl(a)?\(/.test(value)
  );
}

export function getTokenForColor(color: string): string | null {
  for (const [token, value] of Object.entries(TAILWIND_TOKEN_MAP)) {
    if (value.includes(color) || color.includes(value)) return token;
  }
  for (const theme of Object.values(THEMES)) {
    for (const [key, val] of Object.entries(theme)) {
      if (val === color) return `var(--${key.replace(/_/g, "-")})`;
    }
  }
  return null;
}
