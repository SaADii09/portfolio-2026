"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/store";

const INTERACTIVE_SELECTOR = "button, a, input, textarea, select, [role='button'], .os-drag-handle";

export function CustomCursor() {
  const theme = useStore((s) => s.theme);
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const trailOuterRef = useRef<HTMLDivElement>(null);
  const trailInnerRef = useRef<HTMLDivElement>(null);
  const mousePos = useRef({ x: -100, y: -100 });
  const trailPos = useRef({ x: -100, y: -100 });
  const rafRef = useRef(0);
  const isHovering = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };

      const target = e.target as HTMLElement;
      const hovering = target?.closest?.(INTERACTIVE_SELECTOR) !== null;

      if (hovering !== isHovering.current) {
        isHovering.current = hovering;
        const inner = innerRef.current;
        const trail = trailOuterRef.current;
        if (inner) {
          inner.style.transform = hovering ? "translate(-50%, -50%) scale(1.4)" : "translate(-50%, -50%) scale(1)";
        }
        if (trail) {
          trail.style.transform = hovering
            ? `translate(${trailPos.current.x}px, ${trailPos.current.y}px) scale(1.2)`
            : `translate(${trailPos.current.x}px, ${trailPos.current.y}px) scale(1)`;
        }
      }
    };

    const animate = () => {
      const outer = outerRef.current;
      const trailOuter = trailOuterRef.current;
      if (!outer) return;

      outer.style.transform = `translate(${mousePos.current.x}px, ${mousePos.current.y}px)`;

      if (trailOuter) {
        trailPos.current.x += (mousePos.current.x - trailPos.current.x) * 0.12;
        trailPos.current.y += (mousePos.current.y - trailPos.current.y) * 0.12;
        const scale = isHovering.current ? 1.2 : 1;
        trailOuter.style.transform = `translate(${trailPos.current.x}px, ${trailPos.current.y}px) scale(${scale})`;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", handleMouseMove);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      <div
        ref={trailOuterRef}
        className="os-cursor-pos"
        style={{ position: "fixed", top: 0, left: 0, pointerEvents: "none", zIndex: 99999, transition: "transform 80ms ease-out" }}
      >
        <div ref={trailInnerRef} className={`os-cursor-trail os-cursor-trail-${theme}`} />
      </div>
      <div
        ref={outerRef}
        className="os-cursor-pos"
        style={{ position: "fixed", top: 0, left: 0, pointerEvents: "none", zIndex: 100000, transition: "transform 60ms ease-out" }}
      >
        <div
          ref={innerRef}
          className={`os-cursor os-cursor-${theme}`}
          style={{ transition: "transform 120ms ease-out", transform: "translate(-50%, -50%)" }}
        />
      </div>
    </>
  );
}
