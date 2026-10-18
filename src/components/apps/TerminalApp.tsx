"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "@/store";
import { openApp, musicControl, setThemeByName } from "@/lib/os-actions";
import { executeCommand, BANNER, type TerminalContext } from "@/lib/terminal-commands";

type Line = { content: string; isOutput: boolean };

/** Fresh snapshot of the store + os-actions, injected into the pure executor. */
function buildTerminalContext(): TerminalContext {
  return {
    theme: useStore.getState().theme,
    openApp,
    setThemeByName,
    musicControl,
    getMusicState: () => {
      const s = useStore.getState();
      return { title: s.currentTrack.title, artist: s.currentTrack.artist, isPlaying: s.isPlaying };
    },
  };
}

export function TerminalApp() {
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

  const execute = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    setHistory((h) => [...h, trimmed]);
    setHistIdx(-1);

    const result = executeCommand(trimmed, buildTerminalContext());
    if (result.clear) {
      setLines([]);
    } else {
      setLines((l) => [...l, ...result.lines.map((content) => ({ content, isOutput: true }))]);
    }
  }, []);

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
          // idx is bounds-checked above; ?? "" only satisfies the widened type.
          setInput(history[idx] ?? "");
        }
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx >= 0) {
        const idx = histIdx + 1;
        if (idx < history.length) {
          setHistIdx(idx);
          setInput(history[idx] ?? "");
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
      style={{ background: "#0d0d0d", color: "#00ff41" }} // design-token-exempt: fixed CRT terminal palette (theme-invariant) by design
    >
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 whitespace-pre-wrap leading-relaxed">
        {lines.map((l, i) => (
          <div
            key={i}
            className={l.isOutput ? "opacity-90" : ""}
            style={{ color: l.isOutput ? "#00ff41" : "#00cc33" }} // design-token-exempt: fixed CRT terminal palette (theme-invariant) by design
          >
            {l.content}
          </div>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 p-3 border-t"
        style={{ borderColor: "#00ff4133", background: "#0a0a0a" }} // design-token-exempt: fixed CRT terminal palette (theme-invariant) by design
      >
        <span style={{ color: "#00ff41" }}>$</span> {/* design-token-exempt: fixed CRT terminal palette (theme-invariant) by design */}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent outline-none font-mono text-sm"
          style={{ color: "#00ff41" }} // design-token-exempt: fixed CRT terminal palette (theme-invariant) by design
          placeholder="Type a command..."
          spellCheck={false}
          autoComplete="off"
        />
      </form>
    </div>
  );
}
