"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/useMediaQuery";

interface ContextMenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

// --- Roving focus helpers (kept tiny so new-function cyclomatic stays ≤ 4) ---

type FocusAction = "down" | "up" | "home" | "end";

const KEY_TO_ACTION: Record<string, FocusAction> = {
  ArrowDown: "down",
  ArrowUp: "up",
  Home: "home",
  End: "end",
};

/** Map a keyboard key to a focus action; undefined for keys we don't handle. */
function actionFromKey(key: string): FocusAction | undefined {
  return KEY_TO_ACTION[key];
}

/** Resolve the next roving index for a focus action (wraps for up/down). */
function resolveFocus(action: FocusAction, current: number, count: number): number {
  if (action === "home") return 0;
  if (action === "end") return count - 1;
  if (action === "down") return (current + 1) % count;
  return (current - 1 + count) % count;
}

/** Next roving index from a key event, or null when the key isn't ours. */
function nextFocusIndex(key: string, current: number, count: number): number | null {
  const action = actionFromKey(key);
  if (!action || count === 0) return null;
  return resolveFocus(action, current, count);
}

/** Client viewport with SSR fallback (desktop-style defaults). */
function getViewportSize(): { vw: number; vh: number } {
  if (typeof window === "undefined") return { vw: 1024, vh: 768 };
  return { vw: window.innerWidth, vh: window.innerHeight };
}

/** Menu dimensions from item count (mobile rows are taller). */
function getMenuSize(itemCount: number, isMobile: boolean): { menuW: number; menuH: number } {
  const itemH = isMobile ? 44 : 36;
  return { menuW: 200, menuH: itemCount * itemH };
}

/** Clamp the menu into the viewport, flipping above the anchor when it would overflow the bottom. */
function getClampedPosition(
  position: { x: number; y: number },
  vw: number,
  vh: number,
  size: { menuW: number; menuH: number },
): { x: number; y: number } {
  const x = Math.min(position.x, vw - size.menuW - 8);
  const y = position.y + size.menuH > vh - 60 ? position.y - size.menuH - 4 : position.y + 4;
  return { x, y };
}

/** Roving tab index: only the focused item stays in the page tab order. */
function tabIndexFor(focused: boolean): number {
  return focused ? 0 : -1;
}

/** Text color (danger accent) and row padding for a menu item. */
function itemColor(item: ContextMenuItem, isMobile: boolean) {
  return {
    color: item.danger ? "var(--accent-2)" : "var(--text-primary)",
    paddingBlock: isMobile ? "12px" : "6px",
  };
}

const menuVariants = {
  hidden: { scale: 0.9, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: "spring" as const, damping: 25, stiffness: 400 },
  },
  exit: { scale: 0.9, opacity: 0, transition: { duration: 0.1 } },
};

function SeparatorRow() {
  return (
    <div
      className="my-1 mx-2 h-px"
      style={{ background: "color-mix(in srgb, var(--accent-1) 15%, transparent)" }}
    />
  );
}

function ItemIcon({ icon }: { icon?: LucideIcon }) {
  if (!icon) return null;
  const Icon = icon;
  return <Icon size={13} className="text-os-accent shrink-0" />;
}

function MenuItemRow({
  item,
  actionIdx,
  focused,
  isMobile,
  registerItemRef,
  onActivate,
}: {
  item: ContextMenuItem;
  actionIdx: number;
  focused: boolean;
  isMobile: boolean;
  registerItemRef: (el: HTMLButtonElement | null, idx: number) => void;
  onActivate: () => void;
}) {
  const Icon = item.icon;
  const onMouseEnter = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.background =
      "color-mix(in srgb, var(--accent-1) 10%, transparent)";
  };
  const onMouseLeave = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.background = "transparent";
  };
  return (
    <button
      ref={(el) => registerItemRef(el, actionIdx)}
      role="menuitem"
      tabIndex={tabIndexFor(focused)}
      onClick={onActivate}
      className="w-full flex items-center gap-2.5 px-3 text-xs font-body transition-all"
      style={itemColor(item, isMobile)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <ItemIcon icon={Icon} />
      {item.label}
    </button>
  );
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Roving focus: `focusIdx` indexes into the actionable (non-separator) items.
  const [focusIdx, setFocusIdx] = useState(0);
  const focusIdxRef = useRef(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  let actionCounter = 0;
  const actionIndex = items.map((item) => (item.separator ? -1 : actionCounter++));
  const actionableCount = items.reduce((n, item) => (item.separator ? n : n + 1), 0);

  const actionableCountRef = useRef(actionableCount);

  // Mirror reactive values into refs for the document-level key listener below
  // (event handlers must not read live-render state through closures).
  useEffect(() => {
    focusIdxRef.current = focusIdx;
    actionableCountRef.current = actionableCount;
  }, [focusIdx, actionableCount]);

  const registerItemRef = useCallback((el: HTMLButtonElement | null, idx: number) => {
    if (idx >= 0) itemRefs.current[idx] = el;
  }, []);
  const focusItemAt = useCallback((idx: number) => {
    setFocusIdx(idx);
    itemRefs.current[idx]?.focus();
  }, []);

  // Focus contract: capture whatever was focused when the menu opened, move
  // focus to the first item, and on unmount (which is how every close path —
  // selection, Escape, outside-pointerdown — reaches us via the parent's
  // onClose) restore focus if the original target is still connected.
  useEffect(() => {
    const previous = document.activeElement;
    previousFocusRef.current = previous instanceof HTMLElement ? previous : null;
    const first = itemRefs.current[0];
    if (first) {
      setFocusIdx(0);
      first.focus();
    }
    return () => {
      const prev = previousFocusRef.current;
      if (prev && prev.isConnected) prev.focus();
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Claim Esc so the global shortcut layer (deferred, checks
        // defaultPrevented) stands down and no window also closes.
        e.preventDefault();
        onClose();
        return;
      }
      const next = nextFocusIndex(e.key, focusIdxRef.current, actionableCountRef.current);
      if (next === null) return;
      // We own the traversal keys while the menu is open — blocks page scroll.
      e.preventDefault();
      focusItemAt(next);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const { vw, vh } = getViewportSize();
  const size = getMenuSize(items.length, isMobile);
  const { x, y } = getClampedPosition(position, vw, vh, size);

  return (
    <motion.div
      ref={menuRef}
      variants={menuVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed z-[10001] glass-heavy overflow-hidden"
      style={{
        left: x,
        top: y,
        width: size.menuW,
        borderRadius: "var(--radius)",
        border: "1px solid color-mix(in srgb, var(--accent-1) 20%, transparent)",
        boxShadow: "var(--shadow-glass-heavy)",
      }}
    >
      <div role="menu" className="py-1">
        {items.map((item, i) =>
          item.separator ? (
            <SeparatorRow key={`sep-${i}`} />
          ) : (
            <MenuItemRow
              key={item.label}
              item={item}
              actionIdx={actionIndex[i] ?? -1}
              focused={actionIndex[i] === focusIdx}
              isMobile={isMobile}
              registerItemRef={registerItemRef}
              onActivate={() => {
                item.onClick();
                onClose();
              }}
            />
          ),
        )}
      </div>
    </motion.div>
  );
}
