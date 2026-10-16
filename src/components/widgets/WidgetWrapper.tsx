"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { useStore } from "@/store";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useContextMenuLongPress } from "@/hooks/useContextMenuLongPress";
import { useHeaderDragHandlers } from "@/hooks/useHeaderDragHandlers";
import { useDragPosition } from "@/hooks/useDragPosition";
import { clampWidgetBounds, resolveWidgetCollisions } from "@/lib/boundaries";
import { ChevronDown, ChevronRight, GripVertical, Pin, PinOff, Trash2 } from "lucide-react";
import { ContextMenu } from "@/components/os/ContextMenu";

interface WidgetWrapperProps {
  id: string;
  children: ReactNode;
}

function viewportWidth() {
  return typeof window !== "undefined" ? window.innerWidth : 1024;
}

function viewportHeight() {
  return typeof window !== "undefined" ? window.innerHeight : 768;
}

export function WidgetWrapper({ id, children }: WidgetWrapperProps) {
  const widget = useStore((s) => s.widgets.find((w) => w.id === id));
  const widgets = useStore((s) => s.widgets);
  const updateWidgetPosition = useStore((s) => s.updateWidgetPosition);
  const toggleWidgetCollapse = useStore((s) => s.toggleWidgetCollapse);
  const toggleWidgetPin = useStore((s) => s.toggleWidgetPin);
  const removeWidget = useStore((s) => s.removeWidget);
  const isMobile = useIsMobile();
  const { contextMenu, openContextMenuAt, closeContextMenu, longPress } = useContextMenuLongPress();

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

  const { handlePointerDown } = useDragPosition({
    elementRef: widgetElRef,
    posX: widget?.x ?? 0,
    posY: widget?.y ?? 0,
    disabled: !widget || widget.isPinned || isMobile,
    clamp: (x, y) =>
      clampWidgetBounds(x, y, widget?.width || 200, 100, viewportWidth(), viewportHeight()),
    // Mid-drag: commit the raw position so the store (and therefore the
    // re-rendered transform) tracks the pointer 1:1 while overlapping.
    onCommit: (x, y) => updateWidgetPosition(id, x, y),
    // On drop: push the widget out of its neighbours, exactly like before.
    onRelease: (x, y) => {
      const others = widgets.filter((w) => w.id !== id && !w.isCollapsed);
      const p = resolveWidgetCollisions(
        x,
        y,
        widget?.width || 200,
        100,
        others,
        viewportWidth(),
        viewportHeight(),
      );
      updateWidgetPosition(id, p.x, p.y);
    },
  });

  const { headerDown, headerMove, headerUp } = useHeaderDragHandlers(longPress, handlePointerDown);

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
            onPointerDown={headerDown}
            onPointerMove={headerMove}
            onPointerUp={headerUp}
            onContextMenu={longPress.onContextMenu}
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
              onClose={closeContextMenu}
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
          onPointerDown={headerDown}
          onPointerMove={headerMove}
          onPointerUp={headerUp}
          onContextMenu={(e) => {
            e.preventDefault();
            openContextMenuAt(e.clientX, e.clientY);
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
              <Pin
                size={10}
                style={{ color: "var(--accent-1)", filter: "drop-shadow(0 0 4px var(--accent-1))" }}
              />
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
            onClose={closeContextMenu}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
