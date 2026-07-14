"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useStore } from "@/store";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT } from "@/lib/constants";
import { X, Minus, Maximize2, Minimize2, ExternalLink } from "lucide-react";

interface WindowProps {
  id: string;
  children: ReactNode;
}

export function Window({ id, children }: WindowProps) {
  const win = useStore((s) => s.windows.find((w) => w.id === id));
  const focusWindow = useStore((s) => s.focusWindow);
  const updateWindowPosition = useStore((s) => s.updateWindowPosition);
  const updateWindowSize = useStore((s) => s.updateWindowSize);
  const minimizeWindow = useStore((s) => s.minimizeWindow);
  const maximizeWindow = useStore((s) => s.maximizeWindow);
  const restoreWindow = useStore((s) => s.restoreWindow);
  const closeWindow = useStore((s) => s.closeWindow);
  const setWindowOpacity = useStore((s) => s.setWindowOpacity);
  const activeWindowId = useStore((s) => s.activeWindowId);
  const isMobile = useIsMobile();

  const dragRef = useRef({ sx: 0, sy: 0, wx: 0, wy: 0 });

  const handleHeaderDown = useCallback(
    (e: React.PointerEvent) => {
      if (!win || win.isMaximized || isMobile) return;
      e.preventDefault();
      dragRef.current = { sx: e.clientX, sy: e.clientY, wx: win.x, wy: win.y };
      focusWindow(id);

      const onMove = (e: PointerEvent) => {
        updateWindowPosition(
          id,
          dragRef.current.wx + e.clientX - dragRef.current.sx,
          dragRef.current.wy + e.clientY - dragRef.current.sy,
        );
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [win, id, focusWindow, updateWindowPosition, isMobile],
  );

  const handleResizeDown = useCallback(
    (e: React.PointerEvent) => {
      if (!win || win.isMaximized || isMobile) return;
      e.preventDefault();
      e.stopPropagation();
      focusWindow(id);
      const sx = e.clientX,
        sy = e.clientY;
      const sw = win.width,
        sh = win.height;

      const onMove = (e: PointerEvent) => {
        updateWindowSize(
          id,
          Math.max(MIN_WINDOW_WIDTH, sw + e.clientX - sx),
          Math.max(MIN_WINDOW_HEIGHT, sh + e.clientY - sy),
        );
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [win, id, focusWindow, updateWindowSize, isMobile],
  );

  if (!win) return null;

  const isActive = activeWindowId === win.id;

  if (isMobile) {
    return (
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 300 }}
        className="fixed inset-0 z-[9995] flex flex-col bg-os-surface overflow-hidden"
      >
        <div
          className="flex items-center justify-between px-4 py-3 select-none"
          style={{ background: "var(--accent-1)", color: "var(--bg-primary)" }}
        >
          <span className="font-display text-xs truncate tracking-wide min-h-[44px] flex items-center">
            {win.title}
          </span>
          <div className="flex items-center gap-3">
            {win.type === "iframe" && win.url && (
              <a
                href={win.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center min-w-[44px] min-h-[44px] hover:opacity-70 transition-opacity"
                style={{ color: "var(--bg-primary)" }}
                aria-label="Open external"
              >
                <ExternalLink size={16} />
              </a>
            )}
            <button
              onClick={() => closeWindow(id)}
              className="flex items-center justify-center min-w-[44px] min-h-[44px] hover:opacity-70 transition-opacity"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 font-body text-sm text-os-text">{children}</div>
      </motion.div>
    );
  }

  const tbH = "calc(100vh - var(--taskbar-height, 48px))";

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: win.opacity }}
      exit={{ scale: 0.85, opacity: 0 }}
      transition={{ type: "spring", damping: 20, stiffness: 300 }}
      onPointerDown={() => !isActive && focusWindow(id)}
      className="absolute bg-os-surface shadow-os border overflow-hidden flex flex-col"
      style={{
        left: win.isMaximized ? 0 : win.x,
        top: win.isMaximized ? 0 : win.y,
        width: win.isMaximized ? "100%" : win.width,
        height: win.isMaximized ? tbH : win.height,
        zIndex: win.zIndex,
        borderRadius: win.isMaximized ? 0 : undefined,
        borderColor: isActive ? "var(--border)" : "transparent",
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing select-none"
        style={{ background: "var(--accent-1)", color: "var(--bg-primary)" }}
        onPointerDown={handleHeaderDown}
      >
        <span className="font-display text-xs truncate tracking-wide">{win.title}</span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={win.opacity}
            onChange={(e) => setWindowOpacity(id, Number(e.target.value))}
            className="w-14 h-1 accent-os-accent cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Window opacity"
            onPointerDown={(e) => e.stopPropagation()}
          />
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => minimizeWindow(id)}
              className="flex items-center justify-center w-5 h-5 rounded-os hover:opacity-70 transition-opacity"
              aria-label="Minimize"
            >
              <Minus size={12} />
            </button>
            <button
              onClick={() => (win.isMaximized ? restoreWindow(id) : maximizeWindow(id))}
              className="flex items-center justify-center w-5 h-5 rounded-os hover:opacity-70 transition-opacity"
              aria-label={win.isMaximized ? "Restore" : "Maximize"}
            >
              {win.isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
            <button
              onClick={() => closeWindow(id)}
              className="flex items-center justify-center w-5 h-5 rounded-os hover:opacity-70 transition-opacity"
              aria-label="Close"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      </div>

      {win.type === "iframe" && win.url && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-body border-b"
          style={{
            background: "var(--bg-tertiary)",
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          <span className="flex-1 truncate">{win.url}</span>
          <a
            href={win.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-70 transition-opacity shrink-0"
            style={{ color: "var(--accent-1)" }}
            aria-label="Open external"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 font-body text-sm text-os-text">{children}</div>

      {!win.isMaximized && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-50 hover:opacity-100 transition-opacity"
          onPointerDown={handleResizeDown}
          style={{
            background: "linear-gradient(135deg, transparent 50%, var(--accent-1) 50%)",
          }}
        />
      )}
    </motion.div>
  );
}
