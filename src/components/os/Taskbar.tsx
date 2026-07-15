"use client";

import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { useStore } from "@/store";
import { useLongPress } from "@/hooks/useLongPress";
import {
  Monitor,
  Settings,
  User,
  FolderKanban,
  FileText,
  Terminal,
  Mail,
  Home,
  Maximize2,
  Minimize2,
  X,
  Target,
} from "lucide-react";
import { StartMenu } from "./StartMenu";
import { ContextMenu } from "./ContextMenu";

const APP_ICONS: Record<string, typeof Monitor> = {
  about: User,
  projects: FolderKanban,
  "control-panel": Settings,
  resume: FileText,
  terminal: Terminal,
  contact: Mail,
};

export function Taskbar() {
  const windows = useStore((s) => s.windows);
  const focusWindow = useStore((s) => s.focusWindow);
  const restoreWindow = useStore((s) => s.restoreWindow);
  const minimizeWindow = useStore((s) => s.minimizeWindow);
  const maximizeWindow = useStore((s) => s.maximizeWindow);
  const closeWindow = useStore((s) => s.closeWindow);
  const [startOpen, setStartOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    windowId: string;
    x: number;
    y: number;
  } | null>(null);

  const handleAppChipClick = useCallback(
    (id: string) => {
      const w = useStore.getState().windows.find((w) => w.id === id);
      if (w?.isMinimized) restoreWindow(id);
      else focusWindow(id);
    },
    [focusWindow, restoreWindow],
  );

  const getWindowMenuItems = (windowId: string) => {
    const w = windows.find((w) => w.id === windowId);
    if (!w) return [];

    return [
      {
        label: w.isMinimized ? "Restore" : "Focus",
        icon: w.isMinimized ? Maximize2 : Target,
        onClick: () => {
          if (w.isMinimized) restoreWindow(windowId);
          else focusWindow(windowId);
        },
      },
      {
        label: "Minimize",
        icon: Minimize2,
        onClick: () => minimizeWindow(windowId),
      },
      {
        label: w.isMaximized ? "Restore Size" : "Maximize",
        icon: Maximize2,
        onClick: () => {
          if (w.isMaximized) {
            useStore.getState().restoreWindow(windowId);
          } else {
            maximizeWindow(windowId);
          }
        },
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Close",
        icon: X,
        danger: true,
        onClick: () => closeWindow(windowId),
      },
    ];
  };

  return (
    <>
      <div
        className="flex items-center px-2 fixed bottom-0 left-0 right-0 z-[9999] glass-heavy"
        style={{
          height: "var(--taskbar-height, 52px)",
          borderTop: "1px solid color-mix(in srgb, var(--accent-1) 10%, transparent)",
          boxShadow: "var(--shadow-glass)",
        }}
      >
        <button
          onClick={() => setStartOpen((v) => !v)}
          className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-os transition-all hover:scale-110 active:scale-95"
          style={{ color: "var(--text-primary)" }}
          aria-label="Home"
        >
          <Home size={20} />
        </button>

        <div className="flex-1 flex items-center justify-center gap-1 overflow-x-auto">
          {windows.map((w) => (
            <MobileTaskbarButton
              key={w.id}
              window={w}
              onClick={() => handleAppChipClick(w.id)}
              onLongPress={(e) => {
                e.preventDefault();
                setContextMenu({ windowId: w.id, x: e.clientX, y: e.clientY });
              }}
            />
          ))}
        </div>
      </div>

      <AnimatePresence>
        {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            items={getWindowMenuItems(contextMenu.windowId)}
            position={{ x: contextMenu.x, y: contextMenu.y }}
            onClose={() => setContextMenu(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function MobileTaskbarButton({
  window: w,
  onClick,
  onLongPress,
}: {
  window: { id: string; component?: string; title: string; isMinimized: boolean };
  onClick: () => void;
  onLongPress: (e: React.PointerEvent) => void;
}) {
  const longPress = useLongPress({ onLongPress });
  const Icon = w.component ? APP_ICONS[w.component] ?? Monitor : Monitor;

  return (
    <button
      onClick={onClick}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onContextMenu={longPress.onContextMenu}
      className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-os transition-all active:scale-95"
      style={{
        color: w.isMinimized ? "var(--text-secondary)" : "var(--accent-1)",
        opacity: w.isMinimized ? 0.5 : 1,
      }}
      aria-label={w.title}
    >
      <Icon size={20} />
    </button>
  );
}
