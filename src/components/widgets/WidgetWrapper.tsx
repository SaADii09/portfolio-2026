"use client";

import { useState, useCallback, useRef, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { useStore } from "@/store";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useLongPress } from "@/hooks/useLongPress";
import { getViewportBounds } from "@/lib/boundaries";
import { ChevronDown, ChevronRight, GripVertical, Pin, PinOff, Trash2 } from "lucide-react";
import { ContextMenu } from "@/components/os/ContextMenu";

interface WidgetWrapperProps {
  id: string;
  children: ReactNode;
}

export function WidgetWrapper({ id, children }: WidgetWrapperProps) {
  const widget = useStore((s) => s.widgets.find((w) => w.id === id));
  const widgets = useStore((s) => s.widgets);
  const updateWidgetPosition = useStore((s) => s.updateWidgetPosition);
  const toggleWidgetCollapse = useStore((s) => s.toggleWidgetCollapse);
  const toggleWidgetPin = useStore((s) => s.toggleWidgetPin);
  const removeWidget = useStore((s) => s.removeWidget);
  const isMobile = useIsMobile();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const dragRef = useRef({ sx: 0, sy: 0, wx: 0, wy: 0 });
  const rafRef = useRef(0);
  const widgetElRef = useRef<HTMLDivElement>(null);

  const getWidgetMenuItems = useCallback(() => {
    if (!widget) return [];
    return [
      {
        label: widget.isPinned ? "Unpin" : "Pin to top",
        icon: widget.isPinned ? PinOff : Pin,
        onClick: () => toggleWidgetPin(id),
      },
      {
        label: widget.isCollapsed ? "Expand" : "Collapse",
        icon: widget.isCollapsed ? ChevronRight : ChevronDown,
        onClick: () => toggleWidgetCollapse(id),
      },
      { label: "", separator: true as const, onClick: () => {} },
      {
        label: "Remove widget",
        icon: Trash2,
        danger: true,
        onClick: () => removeWidget(id),
      },
    ];
  }, [widget, id, toggleWidgetPin, toggleWidgetCollapse, removeWidget]);

  const openContextMenu = useCallback(
    (e: React.PointerEvent | React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  const { onPointerDown: lpDown, onPointerMove: lpMove, onPointerUp: lpUp, onContextMenu: lpContext } = useLongPress({ onLongPress: openContextMenu });

  const resolveCollisions = useCallback(
    (x: number, y: number, widgetW: number, widgetH: number) => {
      const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
      const vh = typeof window !== "undefined" ? window.innerHeight : 768;
      const bounds = getViewportBounds(vw);

      let finalX = Math.max(0, Math.min(x, vw - widgetW));
      let finalY = Math.max(bounds.topBar, Math.min(y, vh - widgetH - bounds.bottomBar));

      const others = widgets.filter((w) => w.id !== id && !w.isCollapsed);
      for (const other of others) {
        const ox = other.x;
        const oy = other.y;
        const ow = other.width || 200;
        const oh = 100;

        const overlaps =
          finalX < ox + ow &&
          finalX + widgetW > ox &&
          finalY < oy + oh &&
          finalY + widgetH > oy;

        if (overlaps) {
          const pushRight = ox + ow - finalX;
          const pushLeft = finalX + widgetW - ox;
          const pushDown = oy + oh - finalY;
          const pushUp = finalY + widgetH - oy;
          const minPush = Math.min(pushRight, pushLeft, pushDown, pushUp);

          if (minPush === pushRight) finalX = ox + ow + 4;
          else if (minPush === pushLeft) finalX = ox - widgetW - 4;
          else if (minPush === pushDown) finalY = oy + oh + 4;
          else finalY = oy - widgetH - 4;
        }
      }

      finalX = Math.max(0, Math.min(finalX, vw - widgetW));
      finalY = Math.max(bounds.topBar, Math.min(finalY, vh - widgetH - bounds.bottomBar));

      return { finalX, finalY };
    },
    [widgets, id],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!widget || widget.isPinned || isMobile) return;
      e.preventDefault();
      dragRef.current = { sx: e.clientX, sy: e.clientY, wx: widget.x, wy: widget.y };

      const el = widgetElRef.current;
      if (el) el.classList.add("os-dragging");
      const widgetW = widget.width || 200;
      const widgetH = 100;

      let pendingX = widget.x;
      let pendingY = widget.y;
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
            updateWidgetPosition(id, pendingX, pendingY);
            rafScheduled = false;
          });
        }
      };

      const onUp = () => {
        if (el) el.classList.remove("os-dragging");
        cancelAnimationFrame(rafRef.current);
        const { finalX, finalY } = resolveCollisions(pendingX, pendingY, widgetW, widgetH);
        updateWidgetPosition(id, finalX, finalY);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [widget, id, updateWidgetPosition, isMobile, resolveCollisions],
  );

  const mergedHeaderDown = useCallback(
    (e: React.PointerEvent) => {
      lpDown(e);
      handlePointerDown(e);
    },
    [lpDown, handlePointerDown],
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

  if (!widget) return null;

  if (isMobile) {
    return (
      <div
        className="flex-shrink-0 flex flex-col overflow-hidden glass-light border"
        style={{
          width: 180,
          borderRadius: "var(--radius)",
          borderColor: "color-mix(in srgb, var(--accent-1) 12%, transparent)",
          boxShadow: "var(--shadow-float)",
        }}
      >
        <div className="relative">
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-[40%] rounded-full"
            style={{ background: "var(--accent-1)" }}
          />
          <div
            className="flex items-center gap-1 px-2 py-1 select-none"
            style={{ background: "color-mix(in srgb, var(--bg-tertiary) 60%, transparent)" }}
            onPointerDown={mergedHeaderDown}
            onPointerMove={mergedHeaderMove}
            onPointerUp={mergedHeaderUp}
            onContextMenu={lpContext}
          >
            <span
              className="flex-1 font-display text-[10px] tracking-wide truncate"
              style={{ color: "var(--text-secondary)" }}
            >
              {widget.title}
            </span>
            <button
              onClick={() => toggleWidgetCollapse(id)}
              className="flex items-center justify-center min-w-[44px] min-h-[44px] transition-all hover:scale-110 active:scale-95"
              aria-label={widget.isCollapsed ? "Expand" : "Collapse"}
            >
              {widget.isCollapsed ? (
                <ChevronRight size={14} style={{ color: "var(--text-primary)" }} />
              ) : (
                <ChevronDown size={14} style={{ color: "var(--text-primary)" }} />
              )}
            </button>
          </div>
        </div>

        {!widget.isCollapsed && (
          <div className="p-2.5 font-body text-xs" style={{ color: "var(--text-primary)" }}>
            {children}
          </div>
        )}

        <AnimatePresence>
          {contextMenu && (
            <ContextMenu
              items={getWidgetMenuItems()}
              position={contextMenu}
              onClose={() => setContextMenu(null)}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div
      ref={widgetElRef}
      className="absolute flex flex-col overflow-hidden glass-light border"
      style={{
        transform: `translate(${widget.x}px, ${widget.y}px)`,
        width: widget.width,
        zIndex: widget.isPinned ? 9996 : 50,
        borderRadius: "var(--radius)",
        borderColor: widget.isPinned
          ? "color-mix(in srgb, var(--accent-1) 40%, transparent)"
          : "color-mix(in srgb, var(--accent-1) 12%, transparent)",
        boxShadow: widget.isPinned ? "var(--shadow-window-active)" : "var(--shadow-float)",
      }}
    >
      <div className="relative">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-[40%] rounded-full"
          style={{ background: "var(--accent-1)" }}
        />
        <div
          className="flex items-center gap-1 px-2 py-1 cursor-grab active:cursor-grabbing select-none"
          style={{ background: "color-mix(in srgb, var(--bg-tertiary) 60%, transparent)" }}
          onPointerDown={mergedHeaderDown}
          onPointerMove={mergedHeaderMove}
          onPointerUp={mergedHeaderUp}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <GripVertical size={12} style={{ color: "var(--text-secondary)" }} />
          <span
            className="flex-1 font-display text-[10px] tracking-wide truncate"
            style={{ color: "var(--text-secondary)" }}
          >
            {widget.title}
          </span>
          <button
            onClick={() => toggleWidgetPin(id)}
            className="flex items-center justify-center w-4 h-4 transition-all hover:scale-125 active:scale-95"
            aria-label={widget.isPinned ? "Unpin" : "Pin to top"}
            title={widget.isPinned ? "Unpin" : "Pin to top"}
          >
            {widget.isPinned ? (
              <Pin size={10} style={{ color: "var(--accent-1)", filter: "drop-shadow(0 0 4px var(--accent-1))" }} />
            ) : (
              <PinOff size={10} style={{ color: "var(--text-secondary)" }} />
            )}
          </button>
          <button
            onClick={() => toggleWidgetCollapse(id)}
            className="flex items-center justify-center w-4 h-4 transition-all hover:scale-125 active:scale-95"
            aria-label={widget.isCollapsed ? "Expand" : "Collapse"}
          >
            {widget.isCollapsed ? (
              <ChevronRight size={10} style={{ color: "var(--text-primary)" }} />
            ) : (
              <ChevronDown size={10} style={{ color: "var(--text-primary)" }} />
            )}
          </button>
        </div>
      </div>

      {!widget.isCollapsed && (
        <div className="p-2.5 font-body text-xs" style={{ color: "var(--text-primary)" }}>
          {children}
        </div>
      )}

      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            items={getWidgetMenuItems()}
            position={contextMenu}
            onClose={() => setContextMenu(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
