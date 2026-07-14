"use client";

import { useEffect, useRef } from "react";
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

const menuVariants = {
  hidden: { scale: 0.9, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: "spring" as const, damping: 25, stiffness: 400 },
  },
  exit: { scale: 0.9, opacity: 0, transition: { duration: 0.1 } },
};

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const menuW = 200;
  const itemH = isMobile ? 44 : 36;
  const menuH = items.length * itemH;
  const x = Math.min(position.x, vw - menuW - 8);
  const y = position.y + menuH > vh - 60
    ? position.y - menuH - 4
    : position.y + 4;

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
        width: menuW,
        borderRadius: "var(--radius)",
        border: "1px solid color-mix(in srgb, var(--accent-1) 20%, transparent)",
        boxShadow: "var(--shadow-glass-heavy)",
      }}
    >
      <div className="py-1">
        {items.map((item, i) => {
          if (item.separator) {
            return (
              <div
                key={`sep-${i}`}
                className="my-1 mx-2 h-px"
                style={{ background: "color-mix(in srgb, var(--accent-1) 15%, transparent)" }}
              />
            );
          }
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={() => {
                item.onClick();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 text-xs font-body transition-all"
              style={{
                color: item.danger
                  ? "var(--accent-2)"
                  : "var(--text-primary)",
                paddingBlock: isMobile ? "12px" : "6px",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "color-mix(in srgb, var(--accent-1) 10%, transparent)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {Icon && <Icon size={13} className="text-os-accent shrink-0" />}
              {item.label}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
