"use client";

import { useState, useCallback, useRef, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { useStore } from "@/store";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useLongPress } from "@/hooks/useLongPress";
import { MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT } from "@/lib/constants";
import { X, Minus, Maximize2, Minimize2, ExternalLink, Target } from "lucide-react";
import { ContextMenu } from "./ContextMenu";

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
  const activeWindowId = useStore((s) => s.activeWindowId);
  const isMobile = useIsMobile();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const dragRef = useRef({ sx: 0, sy: 0, wx: 0, wy: 0 });
  const rafRef = useRef(0);
  const windowElRef = useRef<HTMLDivElement>(null);

  const getWindowMenuItems = useCallback(() => {
    if (!win) return [];
    return [
      {
        label: "Focus",
        icon: Target,
        onClick: () => focusWindow(id),
      },
      {
        label: "Minimize",
        icon: Minimize2,
        onClick: () => minimizeWindow(id),
      },
      {
        label: win.isMaximized ? "Restore Size" : "Maximize",
        icon: Maximize2,
        onClick: () => {
          if (win.isMaximized) restoreWindow(id);
          else maximizeWindow(id);
        },
      },
      { label: "", separator: true as const, onClick: () => {} },
      {
        label: "Close",
        icon: X,
        danger: true,
        onClick: () => closeWindow(id),
      },
    ];
  }, [win, id, focusWindow, minimizeWindow, maximizeWindow, restoreWindow, closeWindow]);

  const openContextMenu = useCallback(
    (e: React.PointerEvent | React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  const { onPointerDown: lpDown, onPointerMove: lpMove, onPointerUp: lpUp, onContextMenu: lpContext } = useLongPress({ onLongPress: openContextMenu });

  const handleHeaderDown = useCallback(
    (e: React.PointerEvent) => {
      if (!win || win.isMaximized) return;
      e.preventDefault();
      dragRef.current = { sx: e.clientX, sy: e.clientY, wx: win.x, wy: win.y };
      focusWindow(id);

      const el = windowElRef.current;
      if (el) el.classList.add("os-dragging");

      let pendingX = win.x;
      let pendingY = win.y;
      let rafScheduled = false;

      const onMove = (e: PointerEvent) => {
        pendingX = dragRef.current.wx + e.clientX - dragRef.current.sx;
        pendingY = dragRef.current.wy + e.clientY - dragRef.current.sy;
        if (el) {
          el.style.transform = `translate(${pendingX}px, ${pendingY}px)`;
        }
        if (!rafScheduled) {
          rafScheduled = true;
          rafRef.current = requestAnimationFrame(() => {
            updateWindowPosition(id, pendingX, pendingY);
            rafScheduled = false;
          });
        }
      };
      const onUp = () => {
        if (el) el.classList.remove("os-dragging");
        cancelAnimationFrame(rafRef.current);
        updateWindowPosition(id, pendingX, pendingY);
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

      const el = windowElRef.current;
      if (el) el.classList.add("os-dragging");

      const sx = e.clientX;
      const sy = e.clientY;
      const sw = win.width;
      const sh = win.height;
      const wx = win.x;
      const wy = win.y;

      let pendingW = sw;
      let pendingH = sh;
      let pendingX = wx;
      let pendingY = wy;
      let rafScheduled = false;

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

        pendingW = newW;
        pendingH = newH;
        pendingX = newX;
        pendingY = newY;

        if (el) {
          el.style.transform = `translate(${newX}px, ${newY}px)`;
          el.style.width = `${newW}px`;
          el.style.height = `${newH}px`;
        }

        if (!rafScheduled) {
          rafScheduled = true;
          rafRef.current = requestAnimationFrame(() => {
            updateWindowSize(id, pendingW, pendingH);
            updateWindowPosition(id, pendingX, pendingY);
            rafScheduled = false;
          });
        }
      };

      const onUp = () => {
        if (el) el.classList.remove("os-dragging");
        cancelAnimationFrame(rafRef.current);
        updateWindowSize(id, pendingW, pendingH);
        updateWindowPosition(id, pendingX, pendingY);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [win, id, focusWindow, updateWindowSize, updateWindowPosition],
  );

  const mergedHeaderDown = useCallback(
    (e: React.PointerEvent) => {
      lpDown(e);
      handleHeaderDown(e);
    },
    [lpDown, handleHeaderDown],
  );

  const mergedHeaderMove = useCallback(
    (e: React.PointerEvent) => {
      lpMove(e);
    },
    [lpMove],
  );

  const mergedHeaderUp = useCallback(
    (e: React.PointerEvent) => {
      lpUp(e);
    },
    [lpUp],
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

  const renderDesktopResizeHandles = () => {
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

  const renderMobileGripHandles = () => {
    if (win.isMaximized) return null;
    return (
      <>
        <div
          className="os-mobile-grip os-mobile-grip-s"
          onPointerDown={(e) => handleResizeDown(e, "s")}
        />
        <div
          className="os-mobile-grip os-mobile-grip-e"
          onPointerDown={(e) => handleResizeDown(e, "e")}
        />
        <div
          className="os-mobile-grip os-mobile-grip-w"
          onPointerDown={(e) => handleResizeDown(e, "w")}
        />
      </>
    );
  };

  const windowStyle = (x: number, y: number, w: number, h: number, maximized: boolean) => ({
    transform: maximized ? "translate(0, 0)" : `translate(${x}px, ${y}px)`,
    width: maximized ? "100%" : w,
    height: maximized ? "calc(100vh - var(--taskbar-height, 48px))" : h,
    zIndex: win.zIndex,
    borderRadius: maximized ? 0 : "var(--radius)",
    boxShadow: isActive ? "var(--shadow-window-active)" : "var(--shadow-window)",
  });

  const renderContextMenu = () => (
    <AnimatePresence>
      {contextMenu && (
        <ContextMenu
          items={getWindowMenuItems()}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </AnimatePresence>
  );

  if (isMobile) {
    const vw = typeof window !== "undefined" ? window.innerWidth : 375;
    const vh = typeof window !== "undefined" ? window.innerHeight : 812;
    const mobileW = win.isMaximized ? vw : Math.min(win.width, vw - 32);
    const mobileH = win.isMaximized ? vh - 52 : Math.min(win.height, vh - 140);
    const mobileX = win.isMaximized ? 0 : Math.max(0, Math.min(win.x, vw - mobileW));
    const mobileY = win.isMaximized ? 0 : Math.max(0, Math.min(win.y, vh - mobileH));

    return (
      <div
        ref={windowElRef}
        onPointerDown={() => !isActive && focusWindow(id)}
        className={`absolute glass overflow-hidden flex flex-col os-window-enter ${isActive ? "glass-border-active" : "glass-border"}`}
        style={windowStyle(mobileX, mobileY, mobileW, mobileH, win.isMaximized)}
      >
        <div
          className="os-drag-handle flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing"
          style={{ background: "var(--accent-1)", color: "var(--bg-primary)" }}
          onPointerDown={mergedHeaderDown}
          onPointerMove={mergedHeaderMove}
          onPointerUp={mergedHeaderUp}
          onContextMenu={lpContext}
        >
          <span className="font-display text-xs truncate tracking-wide">{win.title}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => minimizeWindow(id)}
              className="flex items-center justify-center w-5 h-5 rounded-os transition-all hover:scale-110 active:scale-95"
              aria-label="Minimize"
            >
              <Minus size={12} />
            </button>
            <button
              onClick={() => (win.isMaximized ? restoreWindow(id) : maximizeWindow(id))}
              className="flex items-center justify-center w-5 h-5 rounded-os transition-all hover:scale-110 active:scale-95"
              aria-label={win.isMaximized ? "Restore" : "Maximize"}
            >
              {win.isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
            <button
              onClick={() => closeWindow(id)}
              className="flex items-center justify-center w-5 h-5 rounded-os transition-all hover:scale-110 active:scale-95"
              aria-label="Close"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {win.type === "iframe" && win.url && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-body border-b glass"
            style={{
              borderColor: "color-mix(in srgb, var(--border) 40%, transparent)",
              color: "var(--text-secondary)",
            }}
          >
            <span className="flex-1 truncate">{win.url}</span>
            <a
              href={win.url}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-all hover:scale-110 shrink-0"
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

        {renderMobileGripHandles()}
        {renderContextMenu()}
      </div>
    );
  }

  return (
    <div
      ref={windowElRef}
      onPointerDown={() => !isActive && focusWindow(id)}
      className={`absolute glass overflow-hidden flex flex-col os-window-enter ${isActive ? "glass-border-active" : "glass-border"}`}
      style={windowStyle(win.x, win.y, win.width, win.height, win.isMaximized)}
    >
      <div
        className="os-drag-handle flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing select-none"
        style={{ background: "var(--accent-1)", color: "var(--bg-primary)" }}
        onPointerDown={handleHeaderDown}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        <span className="font-display text-xs truncate tracking-wide">{win.title}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => minimizeWindow(id)}
            className="flex items-center justify-center w-5 h-5 rounded-os transition-all hover:scale-110 active:scale-95"
            aria-label="Minimize"
          >
            <Minus size={12} />
          </button>
          <button
            onClick={() => (win.isMaximized ? restoreWindow(id) : maximizeWindow(id))}
            className="flex items-center justify-center w-5 h-5 rounded-os transition-all hover:scale-110 active:scale-95"
            aria-label={win.isMaximized ? "Restore" : "Maximize"}
          >
            {win.isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={() => closeWindow(id)}
            className="flex items-center justify-center w-5 h-5 rounded-os transition-all hover:scale-110 active:scale-95"
            aria-label="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {win.type === "iframe" && win.url && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-body border-b glass"
          style={{
            borderColor: "color-mix(in srgb, var(--border) 40%, transparent)",
            color: "var(--text-secondary)",
          }}
        >
          <span className="flex-1 truncate">{win.url}</span>
          <a
            href={win.url}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-all hover:scale-110 shrink-0"
            style={{ color: "var(--accent-1)" }}
            aria-label="Open external"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      )}

      <div className="os-window-content flex-1 p-4 font-body text-sm text-os-text">{children}</div>

      {renderDesktopResizeHandles()}
      {renderContextMenu()}
    </div>
  );
}
