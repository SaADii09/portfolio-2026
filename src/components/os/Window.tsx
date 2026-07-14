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

type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

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
      if (!win || win.isMaximized) return;
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
    [win, id, focusWindow, updateWindowPosition],
  );

  const handleResizeDown = useCallback(
    (e: React.PointerEvent, edge: Edge) => {
      if (!win || win.isMaximized) return;
      e.preventDefault();
      e.stopPropagation();
      focusWindow(id);

      const sx = e.clientX;
      const sy = e.clientY;
      const sw = win.width;
      const sh = win.height;
      const wx = win.x;
      const wy = win.y;

      const onMove = (e: PointerEvent) => {
        const dx = e.clientX - sx;
        const dy = e.clientY - sy;

        let newW = sw;
        let newH = sh;
        let newX = wx;
        let newY = wy;

        if (edge.includes("e")) newW = Math.max(MIN_WINDOW_WIDTH, sw + dx);
        if (edge.includes("w")) {
          newW = Math.max(MIN_WINDOW_WIDTH, sw - dx);
          newX = wx + (sw - newW);
        }
        if (edge.includes("s")) newH = Math.max(MIN_WINDOW_HEIGHT, sh + dy);
        if (edge.includes("n")) {
          newH = Math.max(MIN_WINDOW_HEIGHT, sh - dy);
          newY = wy + (sh - newH);
        }

        updateWindowSize(id, newW, newH);
        updateWindowPosition(id, newX, newY);
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [win, id, focusWindow, updateWindowSize, updateWindowPosition],
  );

  if (!win) return null;

  const isActive = activeWindowId === win.id;

  const edgeClass: Record<Edge, string> = {
    n: "top-0 left-2 right-2 h-2 cursor-ns-resize",
    s: "bottom-0 left-2 right-2 h-2 cursor-ns-resize",
    e: "top-2 bottom-2 right-0 w-2 cursor-ew-resize",
    w: "top-2 bottom-2 left-0 w-2 cursor-ew-resize",
    ne: "top-0 right-0 w-3 h-3 cursor-nesw-resize",
    nw: "top-0 left-0 w-3 h-3 cursor-nwse-resize",
    se: "bottom-0 right-0 w-3 h-3 cursor-nwse-resize",
    sw: "bottom-0 left-0 w-3 h-3 cursor-nesw-resize",
  };

  const renderResizeHandles = () => {
    if (win.isMaximized) return null;
    return (
      <>
        {(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as Edge[]).map((edge) => (
          <div
            key={edge}
            className={`absolute z-10 ${edgeClass[edge]}`}
            onPointerDown={(e) => handleResizeDown(e, edge)}
          />
        ))}
      </>
    );
  };

  if (isMobile) {
    const mobileW = win.isMaximized
      ? (typeof window !== "undefined" ? window.innerWidth : 375)
      : Math.min(win.width, (typeof window !== "undefined" ? window.innerWidth : 375) - 32);
    const mobileH = win.isMaximized
      ? (typeof window !== "undefined" ? window.innerHeight - 52 : 760)
      : Math.min(win.height, (typeof window !== "undefined" ? window.innerHeight - 140 : 500));

    const mobileX = win.isMaximized ? 0 : Math.max(0, Math.min(win.x, (typeof window !== "undefined" ? window.innerWidth : 375) - mobileW));
    const mobileY = win.isMaximized ? 0 : Math.max(0, Math.min(win.y, (typeof window !== "undefined" ? window.innerHeight - 100 : 700) - mobileH));

    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: win.opacity }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 300 }}
        onPointerDown={() => !isActive && focusWindow(id)}
        className="absolute bg-os-surface shadow-os border overflow-hidden flex flex-col"
        style={{
          left: mobileX,
          top: mobileY,
          width: mobileW,
          height: mobileH,
          zIndex: win.zIndex,
          borderRadius: win.isMaximized ? 0 : undefined,
          borderColor: isActive ? "var(--border)" : "transparent",
        }}
      >
        <div
          className="os-drag-handle flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing"
          style={{ background: "var(--accent-1)", color: "var(--bg-primary)" }}
          onPointerDown={handleHeaderDown}
        >
          <span className="font-display text-xs truncate tracking-wide">{win.title}</span>
          <div className="flex items-center gap-2 shrink-0">
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

        <div className="os-window-content flex-1 p-4 font-body text-sm text-os-text">
          {children}
        </div>

        {renderResizeHandles()}
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
        className="os-drag-handle flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing select-none"
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

      <div className="os-window-content flex-1 p-4 font-body text-sm text-os-text">{children}</div>

      {renderResizeHandles()}
    </motion.div>
  );
}
