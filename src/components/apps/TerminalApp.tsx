"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "@/store";
import type { ThemeName } from "@/types/theme";
import { PERSONAL_INFO, PROJECTS, EXPERIENCE, EDUCATION } from "@/lib/portfolio-data";

const BANNER = `
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

type Line = { content: string; isOutput: boolean };

export function TerminalApp() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const [lines, setLines] = useState<Line[]>([{ content: BANNER, isOutput: true }]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [lines]);

  const execute = useCallback(
    (cmd: string) => {
      const trimmed = cmd.trim();
      const parts = trimmed.split(/\s+/);
      const command = parts[0].toLowerCase();
      const args = parts.slice(1);

      setHistory((h) => [...h, trimmed]);
      setHistIdx(-1);

      const addOutput = (text: string) => {
        setLines((l) => [...l, { content: text, isOutput: true }]);
      };

      switch (command) {
        case "help":
          addOutput(HELP);
          break;
        case "whoami":
          addOutput(`${PERSONAL_INFO.name} — ${PERSONAL_INFO.title}`);
          break;
        case "about":
          addOutput(ABOUT_TEXT);
          break;
        case "projects":
          addOutput(PROJECTS_TEXT);
          break;
        case "resume":
          addOutput(RESUME_TEXT);
          break;
        case "contact":
          addOutput(CONTACT_TEXT);
          break;
        case "theme":
          if (args.length === 0) {
            addOutput(`Current theme: ${theme}`);
          } else {
            const t = args[0] as ThemeName;
            if (["retro", "neon", "editorial"].includes(t)) {
              setTheme(t);
              addOutput(`Theme changed to ${t}`);
            } else {
              addOutput(`Unknown theme: ${t}. Try: retro, neon, editorial`);
            }
          }
          break;
        case "date":
          addOutput(new Date().toString());
          break;
        case "echo":
          addOutput(args.join(" "));
          break;
        case "clear":
          setLines([]);
          break;
        case "neofetch":
          addOutput(
            `OS: DevOS v1.0\nKernel: Next.js 16\nShell: /bin/fake\nResolution: ${typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "unknown"}\nTheme: ${theme}\nUptime: way too long`,
          );
          break;
        case "banner":
          addOutput(BANNER);
          break;
        case "sudo":
          addOutput("⛔ Nice try. You don't have sudo access in a fake terminal.");
          break;
        case "ls":
          addOutput("about  projects  resume  terminal  contact  control-panel");
          break;
        default:
          if (trimmed) addOutput(`Command not found: ${command}. Type 'help'.`);
      }
    },
    [theme, setTheme],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;
    setLines((l) => [...l, { content: `$ ${cmd}`, isOutput: false }]);
    execute(cmd);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0) {
        const idx = histIdx === -1 ? history.length - 1 : histIdx - 1;
        if (idx >= 0) {
          setHistIdx(idx);
          setInput(history[idx]);
        }
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx >= 0) {
        const idx = histIdx + 1;
        if (idx < history.length) {
          setHistIdx(idx);
          setInput(history[idx]);
        } else {
          setHistIdx(-1);
          setInput("");
        }
      }
    }
  };

  return (
    <div
      className="flex flex-col h-full font-mono text-sm"
      style={{ background: "#0d0d0d", color: "#00ff41" }}
    >
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 whitespace-pre-wrap leading-relaxed">
        {lines.map((l, i) => (
          <div
            key={i}
            className={l.isOutput ? "opacity-90" : ""}
            style={{ color: l.isOutput ? "#00ff41" : "#00cc33" }}
          >
            {l.content}
          </div>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 p-3 border-t"
        style={{ borderColor: "#00ff4133", background: "#0a0a0a" }}
      >
        <span style={{ color: "#00ff41" }}>$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent outline-none font-mono text-sm"
          style={{ color: "#00ff41" }}
          placeholder="Type a command..."
          spellCheck={false}
          autoComplete="off"
        />
      </form>
    </div>
  );
}
