import type { ThemeName } from "@/types/theme";
import { APP_DEFS, resolveAppId, type AppId } from "@/lib/apps";
import { PERSONAL_INFO, PROJECTS, EXPERIENCE, EDUCATION } from "@/lib/portfolio-data";

/**
 * Pure terminal command executor — no React, no store access.
 * `TerminalApp` builds the injected `TerminalContext` from `useStore.getState()`
 * plus `os-actions` and renders the returned lines.
 */

export interface TerminalContext {
  theme: ThemeName;
  openApp(id: AppId): void;
  setThemeByName(name: string): boolean;
  musicControl(a: "play" | "pause" | "toggle" | "next" | "prev"): void;
  getMusicState(): { title: string; artist: string; isPlaying: boolean };
}

export interface CommandResult {
  lines: string[];
  clear?: boolean;
}

export const BANNER = `
   ___          _     ____   ___  ____  
  / _ \\___  ___| |_  / ___| / _ \\/ ___|
 / /_\\/ _ \\/ __| __| \\___ \\| | | \\___ \\ 
/ /_\\\\  __/\\__ \\ |_  ___) | |_| |___) |
\\____/\\___||___/\\__| |____/ \\___/|____/ 
                                        
Welcome to DevOS Terminal v1.0
Type 'help' for available commands.
`;

const HELP = `Available commands:
  help       - Show this help message
  whoami     - Display user info
  about      - About the developer
  projects   - List projects
  resume     - Resume summary
  contact    - Contact information
  theme      - Show current theme
  theme <t>  - Switch theme (retro, neon, editorial)
  date       - Show current date and time
  echo <t>   - Echo text
  clear      - Clear terminal
  neofetch   - System info
  banner     - Show welcome banner
  sudo       - 🚫 Nice try
  ls         - List directory contents
  open <app> - Open an app
  music      - Show or control the music player
  apps       - List all apps
`;

const MUSIC_ACTIONS = ["play", "pause", "toggle", "next", "prev"] as const;
type MusicAction = (typeof MUSIC_ACTIONS)[number];

/** Derived from the registry, so a new AppId is reachable from `open` and `ls` for free. */
const UNKNOWN_APP_HINT = APP_DEFS.map((a) => a.id).join(", ");

/** `♪ <title> — <artist> [playing]` (or `[paused]`) — shared by the status and control paths. */
function formatTrack(state: { title: string; artist: string; isPlaying: boolean }): string {
  return `♪ ${state.title} — ${state.artist} [${state.isPlaying ? "playing" : "paused"}]`;
}

const ABOUT_TEXT = PERSONAL_INFO.summary.paragraphs.slice(0, 2).join("\n");

const PROJECTS_TEXT = PROJECTS.map((p, i) => `${i + 1}. ${p.title} — ${p.description}`).join("\n");

const RESUME_TEXT = [
  PERSONAL_INFO.name,
  PERSONAL_INFO.title,
  "",
  "Experience:",
  ...EXPERIENCE.map((e) => `- ${e.role} @ ${e.company} (${e.period})`),
  "",
  "Education:",
  ...EDUCATION.map((e) => `- ${e.degree} ${e.field}, ${e.institution} (${e.graduationDate})`),
].join("\n");

const CONTACT_TEXT = [
  `Email: ${PERSONAL_INFO.contact.email}`,
  `LinkedIn: ${PERSONAL_INFO.contact.links.linkedin}`,
  `GitHub: ${PERSONAL_INFO.contact.links.github}`,
].join("\n");

type CommandHandler = (args: string[], ctx: TerminalContext) => CommandResult;

/** Wrap a fixed output so it can share the dispatch table with the dynamic handlers. */
function fixedOutput(lines: string[]): CommandHandler {
  return () => ({ lines });
}

function neofetchText(theme: ThemeName): string {
  const resolution =
    typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "unknown";
  return `OS: DevOS v1.0\nKernel: Next.js 16\nShell: /bin/fake\nResolution: ${resolution}\nTheme: ${theme}\nUptime: way too long`;
}

function handleTheme(args: string[], ctx: TerminalContext): CommandResult {
  const [name] = args;
  if (!name) return { lines: [`Current theme: ${ctx.theme}`] };
  if (ctx.setThemeByName(name)) return { lines: [`Theme changed to ${name}`] };
  return { lines: [`Unknown theme: ${name}. Try: retro, neon, editorial`] };
}

function handleOpen(args: string[], ctx: TerminalContext): CommandResult {
  const [arg] = args;
  if (!arg) return { lines: ["Usage: open <app>"] };
  const id = resolveAppId(arg);
  if (!id) return { lines: [`Unknown app: ${arg}. Try: ${UNKNOWN_APP_HINT}`] };
  ctx.openApp(id);
  return { lines: [`Opening ${APP_DEFS.find((a) => a.id === id)!.title}`] };
}

function isMusicAction(value: string): value is MusicAction {
  return (MUSIC_ACTIONS as readonly string[]).includes(value);
}

function handleMusic(args: string[], ctx: TerminalContext): CommandResult {
  const [raw] = args;
  if (!raw) return { lines: [formatTrack(ctx.getMusicState())] };
  const action = raw.toLowerCase();
  if (!isMusicAction(action)) {
    return { lines: ["Usage: music [play|pause|toggle|next|prev]"] };
  }
  ctx.musicControl(action);
  return { lines: [formatTrack(ctx.getMusicState())] };
}

/** Command name/alias → handler. Pure lookups keep the dispatcher branch-free. */
const COMMANDS = new Map<string, CommandHandler>([
  ["help", fixedOutput([HELP])],
  ["whoami", fixedOutput([`${PERSONAL_INFO.name} — ${PERSONAL_INFO.title}`])],
  ["about", fixedOutput([ABOUT_TEXT])],
  ["projects", fixedOutput([PROJECTS_TEXT])],
  ["resume", fixedOutput([RESUME_TEXT])],
  ["contact", fixedOutput([CONTACT_TEXT])],
  ["theme", handleTheme],
  ["date", () => ({ lines: [new Date().toString()] })],
  ["echo", (args) => ({ lines: [args.join(" ")] })],
  ["clear", () => ({ lines: [], clear: true })],
  ["neofetch", (_args, ctx) => ({ lines: [neofetchText(ctx.theme)] })],
  ["banner", fixedOutput([BANNER])],
  ["sudo", fixedOutput(["⛔ Nice try. You don't have sudo access in a fake terminal."])],
  ["ls", fixedOutput([APP_DEFS.map((a) => a.id).join("  ")])],
  ["open", handleOpen],
  ["music", handleMusic],
  ["apps", fixedOutput(APP_DEFS.map((a) => `${a.id} — ${a.title}`))],
]);

export function executeCommand(input: string, ctx: TerminalContext): CommandResult {
  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);
  const command = (parts[0] ?? "").toLowerCase();
  const args = parts.slice(1);

  const handler = COMMANDS.get(command);
  if (handler) return handler(args, ctx);

  if (!trimmed) return { lines: [] };
  return { lines: [`Command not found: ${command}. Type 'help'.`] };
}
