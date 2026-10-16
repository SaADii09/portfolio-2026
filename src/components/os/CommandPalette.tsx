"use client";

import { useMemo, useRef } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { useStore } from "@/store";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { handleInputKeyDown, usePaletteNav, usePaletteSources } from "@/hooks/usePaletteNav";
import type { PaletteNav } from "@/hooks/usePaletteNav";
import { usePaletteOverlay } from "@/hooks/usePaletteOverlay";
import { activeOptionId, closeOnBackdrop, LISTBOX_ID, optionId, trapTab } from "./paletteDom";
import { buildPaletteItems } from "./paletteItems";
import type { PaletteItem } from "./paletteItems";

const paletteVariants = {
  hidden: { scale: 0.96, y: -8, opacity: 0 },
  visible: {
    scale: 1,
    y: 0,
    opacity: 1,
    transition: { type: "spring" as const, damping: 28, stiffness: 380 },
  },
  exit: { scale: 0.96, y: -8, opacity: 0, transition: { duration: 0.12 } },
};

function overlayStyle(isMobile: boolean): CSSProperties {
  if (isMobile) {
    return {
      paddingTop: "15vh",
      paddingLeft: 12,
      paddingRight: 12,
      transformOrigin: "50% 20vh",
    };
  }
  return { paddingTop: "20vh", paddingLeft: 0, paddingRight: 0, transformOrigin: "50% 20vh" };
}

function dialogStyle(isMobile: boolean): CSSProperties {
  return {
    width: isMobile ? "100%" : 560,
    maxHeight: isMobile ? "60vh" : "70vh",
    borderRadius: "var(--radius)",
    border: "1px solid color-mix(in srgb, var(--accent-1) 20%, transparent)",
    boxShadow: "var(--shadow-glass-heavy)",
  };
}

interface PaletteSearchRowProps {
  inputRef: RefObject<HTMLInputElement | null>;
  nav: PaletteNav;
}

function PaletteSearchRow({ inputRef, nav }: PaletteSearchRowProps) {
  const hasResults = nav.results.length > 0;
  return (
    <div
      className="flex items-center gap-2.5 px-4 h-12 flex-shrink-0"
      style={{
        borderBottom: "1px solid color-mix(in srgb, var(--accent-1) 12%, transparent)",
      }}
    >
      <Search size={15} className="text-os-accent flex-shrink-0" />
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={hasResults}
        aria-controls={hasResults ? LISTBOX_ID : undefined}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId(nav.selectedIndex)}
        aria-label="Search commands"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search apps, themes and commands…"
        value={nav.query}
        onChange={(e) => nav.setQuery(e.target.value)}
        onKeyDown={(e) => handleInputKeyDown(e, nav)}
        className="flex-1 min-w-0 bg-transparent outline-none text-sm font-body"
        style={{ color: "var(--text-primary)" }}
      />
    </div>
  );
}

function PaletteRow({ item, index, nav }: { item: PaletteItem; index: number; nav: PaletteNav }) {
  const isSelected = index === nav.selectedIndex;
  return (
    <button
      type="button"
      id={optionId(index)}
      role="option"
      aria-selected={isSelected}
      onClick={() => nav.runItem(item)}
      onMouseEnter={() => nav.select(index)}
      className="w-full flex items-center justify-between gap-3 px-4 text-left text-xs font-body transition-colors"
      style={{
        minHeight: 40,
        color: "var(--text-primary)",
        background: isSelected
          ? "color-mix(in srgb, var(--accent-1) 14%, transparent)"
          : "transparent",
      }}
    >
      <span className="truncate">{item.label}</span>
      <span className="text-[9px] flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
        {item.category}
      </span>
    </button>
  );
}

function PaletteEmpty() {
  return (
    <div
      className="px-4 py-6 text-center text-xs font-body"
      style={{ color: "var(--text-secondary)" }}
    >
      No matching commands
    </div>
  );
}

function PaletteResults({ nav }: { nav: PaletteNav }) {
  if (nav.results.length === 0) return <PaletteEmpty />;
  return (
    <div id={LISTBOX_ID} role="listbox" aria-label="Commands" className="overflow-y-auto py-1.5">
      {nav.results.map((item, i) => (
        <PaletteRow key={item.id} item={item} index={i} nav={nav} />
      ))}
    </div>
  );
}

export function CommandPalette() {
  const isMobile = useIsMobile();
  const { windows, widgets, isPlaying, currentTrack } = usePaletteSources();
  const closePalette = useStore((s) => s.closePalette);

  const items = useMemo(
    () => buildPaletteItems({ windows, widgets, isPlaying, currentTrack }),
    [windows, widgets, isPlaying, currentTrack],
  );
  const nav = usePaletteNav(items);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  usePaletteOverlay({ inputRef, closePalette, selectedIndex: nav.selectedIndex });

  const dismissOnBackdrop = (e: ReactPointerEvent<HTMLDivElement>) =>
    closeOnBackdrop(e, closePalette);
  const keepFocusInside = (e: ReactKeyboardEvent<HTMLDivElement>) => trapTab(e, dialogRef.current);

  return (
    <motion.div
      data-testid="command-palette-overlay"
      variants={paletteVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-[10000] flex items-start justify-center"
      style={overlayStyle(isMobile)}
      onPointerDown={dismissOnBackdrop}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={keepFocusInside}
        className="glass-heavy flex flex-col overflow-hidden"
        style={dialogStyle(isMobile)}
      >
        <PaletteSearchRow inputRef={inputRef} nav={nav} />
        <PaletteResults nav={nav} />
      </div>
    </motion.div>
  );
}
