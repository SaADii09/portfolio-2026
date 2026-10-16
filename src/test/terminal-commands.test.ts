import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// jsdom has no Web Audio API — stub the synth engine (store → musicSlice imports it)
vi.mock("@/lib/audio-engine", () => ({
  getSynthEngine: () => ({
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
    destroy: vi.fn(),
    isPlaying: false,
  }),
}));

import { useStore } from "@/store";
import { TerminalApp } from "@/components/apps/TerminalApp";
import { executeCommand, type TerminalContext } from "@/lib/terminal-commands";
import { PERSONAL_INFO, PROJECTS, EXPERIENCE, EDUCATION } from "@/lib/portfolio-data";

/**
 * Byte-for-byte pins for the terminal executor, lifted verbatim from the
 * pre-refactor `TerminalApp.tsx` switch statement. `date` is asserted by
 * regex because it reads the wall clock.
 */

const BANNER_TEXT = `
   ___          _     ____   ___  ____  
  / _ \\___  ___| |_  / ___| / _ \\/ ___|
 / /_\\/ _ \\/ __| __| \\___ \\| | | \\___ \\ 
/ /_\\\\  __/\\__ \\ |_  ___) | |_| |___) |
\\____/\\___||___/\\__| |____/ \\___/|____/ 
                                        
Welcome to DevOS Terminal v1.0
Type 'help' for available commands.
`;

const HELP_TEXT = `Available commands:
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

const NEOFETCH_TEXT = `OS: DevOS v1.0\nKernel: Next.js 16\nShell: /bin/fake\nResolution: ${window.innerWidth}x${window.innerHeight}\nTheme: retro\nUptime: way too long`;

function createCtx(overrides: Partial<TerminalContext> = {}): TerminalContext {
  return {
    theme: "retro",
    openApp: vi.fn(),
    setThemeByName: vi.fn(() => true),
    musicControl: vi.fn(),
    getMusicState: vi.fn(() => ({
      title: "Neon Lights",
      artist: "Synthwave Dreams",
      isPlaying: false,
    })),
    ...overrides,
  };
}

describe("executeCommand — byte-for-byte outputs", () => {
  const cases: Array<[string, string[]]> = [
    ["help", [HELP_TEXT]],
    ["whoami", [`${PERSONAL_INFO.name} — ${PERSONAL_INFO.title}`]],
    ["about", [ABOUT_TEXT]],
    ["projects", [PROJECTS_TEXT]],
    ["resume", [RESUME_TEXT]],
    ["contact", [CONTACT_TEXT]],
    ["theme", ["Current theme: retro"]],
    ["neofetch", [NEOFETCH_TEXT]],
    ["banner", [BANNER_TEXT]],
    ["sudo", ["⛔ Nice try. You don't have sudo access in a fake terminal."]],
    ["ls", ["about  projects  resume  terminal  contact  control-panel"]],
  ];

  it.each(cases)("%s", (input, expected) => {
    expect(executeCommand(input, createCtx()).lines).toEqual(expected);
  });

  it("lowercases the command word", () => {
    expect(executeCommand("WHOAMI", createCtx()).lines).toEqual([
      `${PERSONAL_INFO.name} — ${PERSONAL_INFO.title}`,
    ]);
  });

  it("echo joins args (bare echo prints an empty line)", () => {
    expect(executeCommand("echo hello   terminal world", createCtx()).lines).toEqual([
      "hello terminal world",
    ]);
    expect(executeCommand("echo", createCtx()).lines).toEqual([""]);
  });

  it("date returns a Date#toString line", () => {
    const line = executeCommand("date", createCtx()).lines[0];
    expect(line).toMatch(/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4}/);
  });

  it("clear requests a wipe instead of printing", () => {
    expect(executeCommand("clear", createCtx())).toEqual({ lines: [], clear: true });
  });

  it("empty or whitespace-only input prints nothing", () => {
    expect(executeCommand("", createCtx())).toEqual({ lines: [] });
    expect(executeCommand("   ", createCtx())).toEqual({ lines: [] });
  });

  it("unknown commands echo the lowercased word", () => {
    expect(executeCommand("FOO bar", createCtx()).lines).toEqual([
      "Command not found: foo. Type 'help'.",
    ]);
  });

  it("passive commands never touch ctx actions", () => {
    const ctx = createCtx();
    executeCommand("whoami", ctx);
    executeCommand("projects", ctx);
    executeCommand("date", ctx);
    executeCommand("bogus", ctx);
    expect(ctx.openApp).not.toHaveBeenCalled();
    expect(ctx.setThemeByName).not.toHaveBeenCalled();
    expect(ctx.musicControl).not.toHaveBeenCalled();
  });
});

describe("executeCommand — theme command", () => {
  it("reports the current theme from ctx", () => {
    expect(executeCommand("theme", createCtx({ theme: "neon" })).lines).toEqual([
      "Current theme: neon",
    ]);
  });

  it("switches via ctx.setThemeByName and confirms", () => {
    const ctx = createCtx();
    expect(executeCommand("theme neon", ctx).lines).toEqual(["Theme changed to neon"]);
    expect(ctx.setThemeByName).toHaveBeenCalledWith("neon");
  });

  it("prints the unknown-theme error when ctx.setThemeByName returns false", () => {
    const ctx = createCtx({ setThemeByName: vi.fn(() => false) });
    expect(executeCommand("theme bogus", ctx).lines).toEqual([
      "Unknown theme: bogus. Try: retro, neon, editorial",
    ]);
    expect(ctx.setThemeByName).toHaveBeenCalledWith("bogus");
  });
});

describe("executeCommand — OS bridge commands", () => {
  describe("open", () => {
    it("opens an app by id and reports its title", () => {
      const ctx = createCtx();
      expect(executeCommand("open projects", ctx).lines).toEqual(["Opening Projects"]);
      expect(ctx.openApp).toHaveBeenCalledWith("projects");
    });

    it("resolves aliases: settings → control-panel, cv → resume", () => {
      const settingsCtx = createCtx();
      expect(executeCommand("open settings", settingsCtx).lines).toEqual(["Opening Control Panel"]);
      expect(settingsCtx.openApp).toHaveBeenCalledWith("control-panel");

      const cvCtx = createCtx();
      expect(executeCommand("open cv", cvCtx).lines).toEqual(["Opening Resume"]);
      expect(cvCtx.openApp).toHaveBeenCalledWith("resume");
    });

    it("is case-insensitive on the app argument", () => {
      const ctx = createCtx();
      expect(executeCommand("open SETTINGS", ctx).lines).toEqual(["Opening Control Panel"]);
      expect(ctx.openApp).toHaveBeenCalledWith("control-panel");
    });

    it("prints the unknown-app hint and touches nothing", () => {
      const ctx = createCtx();
      expect(executeCommand("open nope", ctx).lines).toEqual([
        "Unknown app: nope. Try: about, projects, terminal, contact, resume, control-panel",
      ]);
      expect(ctx.openApp).not.toHaveBeenCalled();
    });

    it("bare `open` prints usage", () => {
      const ctx = createCtx();
      expect(executeCommand("open", ctx).lines).toEqual(["Usage: open <app>"]);
      expect(ctx.openApp).not.toHaveBeenCalled();
    });
  });

  describe("music", () => {
    it("prints the current track with its playback state", () => {
      expect(executeCommand("music", createCtx()).lines).toEqual([
        "♪ Neon Lights — Synthwave Dreams [paused]",
      ]);
    });

    it("prints [playing] while a track is playing", () => {
      const ctx = createCtx({
        getMusicState: vi.fn(() => ({
          title: "Pixel Rain",
          artist: "8-Bit Universe",
          isPlaying: true,
        })),
      });
      expect(executeCommand("music", ctx).lines).toEqual([
        "♪ Pixel Rain — 8-Bit Universe [playing]",
      ]);
    });

    it.each(["play", "pause", "toggle", "next", "prev"] as const)(
      "music %s performs the action, then reports fresh state",
      (sub) => {
        let state = { title: "Neon Lights", artist: "Synthwave Dreams", isPlaying: false };
        const ctx = createCtx({
          musicControl: vi.fn(() => {
            state = { title: "Pixel Rain", artist: "8-Bit Universe", isPlaying: true };
          }),
          getMusicState: vi.fn(() => state),
        });
        expect(executeCommand(`music ${sub}`, ctx).lines).toEqual([
          "♪ Pixel Rain — 8-Bit Universe [playing]",
        ]);
        expect(ctx.musicControl).toHaveBeenCalledWith(sub);
      },
    );

    it("prints usage for an unknown subcommand without touching the player", () => {
      const ctx = createCtx();
      expect(executeCommand("music wat", ctx).lines).toEqual([
        "Usage: music [play|pause|toggle|next|prev]",
      ]);
      expect(ctx.musicControl).not.toHaveBeenCalled();
    });
  });

  describe("apps", () => {
    it("lists every app as `id — title`, one line each", () => {
      const lines = executeCommand("apps", createCtx()).lines;
      expect(lines).toEqual([
        "about — About Me",
        "projects — Projects",
        "control-panel — Control Panel",
        "resume — Resume",
        "terminal — Terminal",
        "contact — Contact",
      ]);
    });
  });

  describe("help", () => {
    it("documents the bridge commands", () => {
      const help = executeCommand("help", createCtx()).lines[0];
      expect(help).toContain("open <app>");
      expect(help).toContain("music");
      expect(help).toContain("apps");
    });
  });
});

/** Wiring pin: TerminalApp → buildTerminalContext → real store + os-actions. */
describe("TerminalApp wiring (jsdom)", () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({ theme: "retro", windows: [], isPlaying: false });
  });

  function submitCommand(cmd: string) {
    const input = screen.getByPlaceholderText("Type a command...");
    fireEvent.change(input, { target: { value: cmd } });
    fireEvent.submit(input.closest("form")!);
  }

  it("renders the banner and runs commands against the real store", () => {
    render(createElement(TerminalApp));
    expect(screen.getByText(/Welcome to DevOS Terminal v1\.0/)).toBeInTheDocument();

    submitCommand("whoami");
    expect(screen.getByText(`${PERSONAL_INFO.name} — ${PERSONAL_INFO.title}`)).toBeInTheDocument();
  });

  it("theme <t> drives the real store; clear wipes the log", () => {
    render(createElement(TerminalApp));

    submitCommand("theme neon");
    expect(screen.getByText("Theme changed to neon")).toBeInTheDocument();
    expect(useStore.getState().theme).toBe("neon");

    submitCommand("clear");
    expect(screen.queryByText(/Welcome to DevOS Terminal/)).not.toBeInTheDocument();
  });

  it("open focuses instead of duplicating, and music next reports fresh state", () => {
    render(createElement(TerminalApp));
    const projectsWindows = () =>
      useStore.getState().windows.filter((w) => w.component === "projects");

    submitCommand("open projects");
    expect(screen.getByText("Opening Projects")).toBeInTheDocument();
    expect(projectsWindows()).toHaveLength(1);

    submitCommand("open projects");
    expect(projectsWindows()).toHaveLength(1);
    expect(screen.getAllByText("Opening Projects")).toHaveLength(2);

    useStore.setState({ currentTrack: useStore.getState().queue[0] });
    submitCommand("music next");
    expect(useStore.getState().currentTrack.title).toBe("Pixel Rain");
    expect(screen.getByText("♪ Pixel Rain — 8-Bit Universe [playing]")).toBeInTheDocument();
  });
});
