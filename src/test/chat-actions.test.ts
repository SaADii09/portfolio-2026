import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ACTIONS_DOCS,
  CHAT_ACTION_VERBS,
  extractChatActions,
  type ChatActionVerb,
} from "@/lib/ai/actions";

/**
 * The client executor drives the real OS choke point — mock it so no store,
 * window, or audio engine is touched by this suite (no network, no side
 * effects beyond the mocks).
 */
vi.mock("@/lib/os-actions", () => ({
  openApp: vi.fn(),
  openBrowser: vi.fn(),
  setThemeByName: vi.fn(() => true),
  musicControl: vi.fn(),
  toggleWidget: vi.fn(),
}));

import { executeMarkerAction } from "@/lib/ai/actions-client";
import { openApp, openBrowser, setThemeByName, musicControl, toggleWidget } from "@/lib/os-actions";

describe("extractChatActions — valid markers", () => {
  it("strips a whole marker from the text and extracts the action", () => {
    const r = extractChatActions("Try [[action:set_theme:neon]] instead.");
    expect(r.text).toBe("Try  instead.");
    expect(r.actions).toEqual([{ verb: "set_theme", arg: "neon" }]);
    expect(r.openPartial).toBe(false);
  });

  it("extracts several markers in document order", () => {
    const r = extractChatActions("[[action:open_app:about]] then [[action:music:toggle]] done");
    expect(r.actions).toEqual([
      { verb: "open_app", arg: "about" },
      { verb: "music", arg: "toggle" },
    ]);
    expect(r.text).toBe(" then  done");
  });

  it("is lenient: case-insensitive with inner whitespace", () => {
    const r = extractChatActions("now [[ ACTION : OPEN_APP : About ]]");
    expect(r.actions).toEqual([{ verb: "open_app", arg: "about" }]);
    expect(r.text).toBe("now ");
  });

  it("resolves app aliases and keeps the emitted arg", () => {
    const r = extractChatActions("[[action:open_app:settings]]");
    expect(r.actions).toEqual([{ verb: "open_app", arg: "settings" }]);
  });
});

describe("extractChatActions — malformed markers are dropped, text cleaned", () => {
  it("drops an unknown verb", () => {
    const r = extractChatActions("a [[action:foo]] b");
    expect(r.actions).toEqual([]);
    expect(r.text).toBe("a  b");
    expect(r.openPartial).toBe(false);
  });

  it("drops an unknown app id", () => {
    const r = extractChatActions("[[action:open_app:not-an-app]]");
    expect(r.actions).toEqual([]);
    expect(r.text).toBe("");
  });

  it("drops a missing arg, an unknown project slug, and an unknown theme", () => {
    expect(extractChatActions("[[action:open_app]]").actions).toEqual([]);
    expect(extractChatActions("[[action:open_project:nope]]").actions).toEqual([]);
    expect(extractChatActions("[[action:set_theme:vaporwave]]").actions).toEqual([]);
    expect(extractChatActions("[[action:]]").actions).toEqual([]);
    expect(extractChatActions("[[action:]]").text).toBe("");
  });

  it("keeps non-marker bracket text untouched", () => {
    const r = extractChatActions("see the notes [[draft 1]] here");
    expect(r.actions).toEqual([]);
    expect(r.text).toBe("see the notes [[draft 1]] here");
  });
});

describe("extractChatActions — streaming partial tail", () => {
  it("holds back a split marker and reports openPartial", () => {
    const r = extractChatActions("Almost [[act");
    expect(r.openPartial).toBe(true);
    expect(r.actions).toEqual([]);
    expect(r.text).not.toContain("[[");
  });

  it("extracts completed markers while a later split tail is held back", () => {
    const r = extractChatActions("[[action:open_app:about]] and [[act");
    expect(r.actions).toEqual([{ verb: "open_app", arg: "about" }]);
    expect(r.openPartial).toBe(true);
    expect(r.text).not.toContain("[[");
  });

  it("recovers the action once the closing brackets arrive", () => {
    const first = extractChatActions("[[act");
    expect(first.openPartial).toBe(true);
    const full = extractChatActions("[[action:open_app:about]]");
    expect(full.actions).toEqual([{ verb: "open_app", arg: "about" }]);
    expect(full.openPartial).toBe(false);
  });
});

describe("extractChatActions — idempotence + linear perf (sanitizer lesson)", () => {
  const input = "filler text [[action:open_app:about]] tail words ".repeat(230); // ~10k chars

  it("returns the same result for the same content", () => {
    expect(extractChatActions(input)).toEqual(extractChatActions(input));
  });

  it("re-running on stripped text is a no-op (idempotent)", () => {
    const first = extractChatActions(input);
    expect(first.actions.length).toBeGreaterThan(0);
    const second = extractChatActions(first.text);
    expect(second).toEqual({ text: first.text, actions: [], openPartial: false });
  });

  it("parses 10k chars fast — no catastrophic backtracking", () => {
    const pathological = "[[".repeat(5000);
    const start = performance.now();
    extractChatActions(input);
    extractChatActions(pathological);
    expect(performance.now() - start).toBeLessThan(250);
  });
});

describe("ACTIONS_DOCS — prompt snippet cannot drift from the verb table", () => {
  it("documents the marker format and every verb", () => {
    expect(ACTIONS_DOCS).toContain("[[action:<verb>:<arg>]]");
    for (const verb of CHAT_ACTION_VERBS) expect(ACTIONS_DOCS).toContain(verb);
  });

  it("documents every closed arg domain", () => {
    for (const arg of ["about", "saas-crm", "retro", "toggle", "weather"]) {
      expect(ACTIONS_DOCS).toContain(arg);
    }
  });

  it("MANDATES the marker for action requests (drift pin, Task 4b)", () => {
    // The owner-directed rule: an action request must always produce the
    // marker itself, never a prose-only promise of it.
    expect(ACTIONS_DOCS).toContain("ALWAYS emit the matching marker");
    // …while the verb-table header line that the ai-prompt pins rely on stays.
    expect(ACTIONS_DOCS).toContain("[[action:open_app:<app>]]");
  });
});

describe("executeMarkerAction — verb → os-actions routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes each verb to its os-actions function", () => {
    expect(executeMarkerAction({ verb: "open_app", arg: "settings" })).toBe(true);
    expect(openApp).toHaveBeenCalledWith("control-panel");

    expect(executeMarkerAction({ verb: "open_project", arg: "saas-crm" })).toBe(true);
    expect(openBrowser).toHaveBeenCalledWith("saas-crm");

    expect(executeMarkerAction({ verb: "set_theme", arg: "neon" })).toBe(true);
    expect(setThemeByName).toHaveBeenCalledWith("neon");

    expect(executeMarkerAction({ verb: "music", arg: "toggle" })).toBe(true);
    expect(musicControl).toHaveBeenCalledWith("toggle");

    expect(executeMarkerAction({ verb: "toggle_widget", arg: "weather" })).toBe(true);
    expect(toggleWidget).toHaveBeenCalledWith("weather");
  });

  it("drops an unknown verb without calling anything and without throwing", () => {
    const unknown = { verb: "rm_rf", arg: "/" } as unknown as {
      verb: ChatActionVerb;
      arg?: string;
    };
    expect(executeMarkerAction(unknown)).toBe(false);
    expect(openApp).not.toHaveBeenCalled();
    expect(openBrowser).not.toHaveBeenCalled();
    expect(setThemeByName).not.toHaveBeenCalled();
    expect(musicControl).not.toHaveBeenCalled();
    expect(toggleWidget).not.toHaveBeenCalled();
  });

  it("drops open_app with an unresolvable app id (never opens)", () => {
    expect(executeMarkerAction({ verb: "open_app", arg: "not-an-app" })).toBe(false);
    expect(openApp).not.toHaveBeenCalled();
  });

  it("reports a failed theme switch", () => {
    vi.mocked(setThemeByName).mockReturnValueOnce(false);
    expect(executeMarkerAction({ verb: "set_theme", arg: "vaporwave" })).toBe(false);
    expect(setThemeByName).toHaveBeenCalledWith("vaporwave");
  });
});
