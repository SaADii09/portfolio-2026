import type { ThemeName } from "@/types/theme";
import type { AppId } from "@/lib/apps";
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
`;

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

export function executeCommand(input: string, ctx: TerminalContext): CommandResult {
  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case "help":
      return { lines: [HELP] };
    case "whoami":
      return { lines: [`${PERSONAL_INFO.name} — ${PERSONAL_INFO.title}`] };
    case "about":
      return { lines: [ABOUT_TEXT] };
    case "projects":
      return { lines: [PROJECTS_TEXT] };
    case "resume":
      return { lines: [RESUME_TEXT] };
    case "contact":
      return { lines: [CONTACT_TEXT] };
    case "theme":
      if (args.length === 0) {
        return { lines: [`Current theme: ${ctx.theme}`] };
      }
      if (ctx.setThemeByName(args[0])) {
        return { lines: [`Theme changed to ${args[0]}`] };
      }
      return { lines: [`Unknown theme: ${args[0]}. Try: retro, neon, editorial`] };
    case "date":
      return { lines: [new Date().toString()] };
    case "echo":
      return { lines: [args.join(" ")] };
    case "clear":
      return { lines: [], clear: true };
    case "neofetch":
      return {
        lines: [
          `OS: DevOS v1.0\nKernel: Next.js 16\nShell: /bin/fake\nResolution: ${
            typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "unknown"
          }\nTheme: ${ctx.theme}\nUptime: way too long`,
        ],
      };
    case "banner":
      return { lines: [BANNER] };
    case "sudo":
      return { lines: ["⛔ Nice try. You don't have sudo access in a fake terminal."] };
    case "ls":
      return { lines: ["about  projects  resume  terminal  contact  control-panel"] };
    default:
      return trimmed ? { lines: [`Command not found: ${command}. Type 'help'.`] } : { lines: [] };
  }
}
