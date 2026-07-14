"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { useStore } from "@/store";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { ChevronDown, ChevronRight, GripVertical, Pin, PinOff } from "lucide-react";

interface WidgetWrapperProps {
  id: string;
  children: ReactNode;
}

export function WidgetWrapper({ id, children }: WidgetWrapperProps) {
  const widget = useStore((s) => s.widgets.find((w) => w.id === id));
  const updateWidgetPosition = useStore((s) => s.updateWidgetPosition);
  const toggleWidgetCollapse = useStore((s) => s.toggleWidgetCollapse);
  const toggleWidgetPin = useStore((s) => s.toggleWidgetPin);
  const isMobile = useIsMobile();

  const dragRef = useRef({ sx: 0, sy: 0, wx: 0, wy: 0 });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!widget || widget.isPinned || isMobile) return;
      e.preventDefault();
      dragRef.current = { sx: e.clientX, sy: e.clientY, wx: widget.x, wy: widget.y };

      const onMove = (e: PointerEvent) => {
        updateWidgetPosition(
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
    [widget, id, updateWidgetPosition, isMobile],
  );

  if (!widget) return null;

  if (isMobile) {
    return (
      <div
        className="flex-shrink-0 flex flex-col overflow-hidden border border-os-border shadow-os"
        style={{
          width: 180,
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius)",
        }}
      >
        <div
          className="flex items-center gap-1 px-2 py-1 select-none"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <span
            className="flex-1 font-display text-[10px] tracking-wide truncate"
            style={{ color: "var(--text-secondary)" }}
          >
            {widget.title}
          </span>
          <button
            onClick={() => toggleWidgetCollapse(id)}
            className="flex items-center justify-center min-w-[44px] min-h-[44px] hover:opacity-70 transition-opacity"
            aria-label={widget.isCollapsed ? "Expand" : "Collapse"}
          >
            {widget.isCollapsed ? (
              <ChevronRight size={14} style={{ color: "var(--text-primary)" }} />
            ) : (
              <ChevronDown size={14} style={{ color: "var(--text-primary)" }} />
            )}
          </button>
        </div>

        {!widget.isCollapsed && (
          <div className="p-2.5 font-body text-xs" style={{ color: "var(--text-primary)" }}>
            {children}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="absolute flex flex-col overflow-hidden border border-os-border shadow-os"
      style={{
        left: widget.x,
        top: widget.y,
        width: widget.width,
        zIndex: widget.isPinned ? 9998 : 50,
        background: "var(--bg-secondary)",
        borderRadius: "var(--radius)",
      }}
    >
      <div
        className="flex items-center gap-1 px-2 py-1 cursor-grab active:cursor-grabbing select-none"
        style={{ background: "var(--bg-tertiary)" }}
        onPointerDown={handlePointerDown}
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
          className="flex items-center justify-center w-4 h-4 hover:opacity-70 transition-opacity"
          aria-label={widget.isPinned ? "Unpin" : "Pin to top"}
          title={widget.isPinned ? "Unpin" : "Pin to top"}
        >
          {widget.isPinned ? (
            <Pin size={10} style={{ color: "var(--accent-1)" }} />
          ) : (
            <PinOff size={10} style={{ color: "var(--text-secondary)" }} />
          )}
        </button>
        <button
          onClick={() => toggleWidgetCollapse(id)}
          className="flex items-center justify-center w-4 h-4 hover:opacity-70 transition-opacity"
          aria-label={widget.isCollapsed ? "Expand" : "Collapse"}
        >
          {widget.isCollapsed ? (
            <ChevronRight size={10} style={{ color: "var(--text-primary)" }} />
          ) : (
            <ChevronDown size={10} style={{ color: "var(--text-primary)" }} />
          )}
        </button>
      </div>

      {!widget.isCollapsed && (
        <div className="p-2.5 font-body text-xs" style={{ color: "var(--text-primary)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
