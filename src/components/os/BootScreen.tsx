"use client";

import { useState, useEffect, useRef } from "react";

const DEVOS_ASCII = `██████╗ ███████╗██╗   ██╗ ██████╗ ███████╗
██╔══██╗██╔════╝██║   ██║██╔═══██╗██╔════╝
██║  ██║█████╗  ██║   ██║██║   ██║███████╗
██║  ██║██╔══╝  ╚██╗ ██╔╝██║   ██║╚════██║
██████╔╝███████╗ ╚████╔╝ ╚██████╔╝███████║
╚═════╝ ╚══════╝  ╚═══╝   ╚═════╝ ╚══════╝`;

function getBootVisit(): "first" | "returning" {
  if (typeof document === "undefined") return "first";
  const visit = document.documentElement.getAttribute("data-boot-visit");
  return visit === "returning" ? "returning" : "first";
}

const BOOT_VISIT = getBootVisit();

const GLITCH_AT_FIRST = 2200;
const DONE_AT_FIRST = 2700;
const GLITCH_AT_RETURNING = 1800;
const DONE_AT_RETURNING = 2200;

export function BootScreen({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<"boot" | "glitch" | "done">("boot");
  const isReturning = BOOT_VISIT === "returning";
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const delayScale = isReturning ? "returning" : "first";

  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setAttribute("data-boot-delay", delayScale);
    }
  }, [delayScale]);

  useEffect(() => {
    const glitchAt = isReturning ? GLITCH_AT_RETURNING : GLITCH_AT_FIRST;
    const doneAt = isReturning ? DONE_AT_RETURNING : DONE_AT_FIRST;

    const glitchTimer = setTimeout(() => setPhase("glitch"), glitchAt);
    const doneTimer = setTimeout(() => setPhase("done"), doneAt);

    return () => {
      clearTimeout(glitchTimer);
      clearTimeout(doneTimer);
    };
  }, [isReturning]);

  useEffect(() => {
    if (phase !== "glitch") return;
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReduced) return;

    try {
      const audio = new Audio("/sounds/boot-glitch.mp3");
      audio.volume = 0.35;
      audioRef.current = audio;
      audio.play().catch(() => {});
    } catch {
      // audio blocked or file missing — silent fail
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [phase]);

  if (phase === "done") return <>{children}</>;

  return (
    <>
      <div
        ref={overlayRef}
        className={`boot-overlay${phase === "glitch" ? " boot-glitching" : ""}`}
      >
        {phase === "glitch" && (
          <>
            <div className="boot-chromatic boot-chromatic-r" />
            <div className="boot-chromatic boot-chromatic-g" />
            <div className="boot-chromatic boot-chromatic-b" />
          </>
        )}
        <div className="boot-content">
          <pre className="boot-ascii">{DEVOS_ASCII}</pre>
          <div className="boot-spinner">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="boot-dot"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <p className="boot-status" suppressHydrationWarning>
            {isReturning
              ? "Restoring your session..."
              : "Creating your session..."}
          </p>
          <p className="boot-version">v1.0</p>
        </div>
      </div>
      {children}
    </>
  );
}
