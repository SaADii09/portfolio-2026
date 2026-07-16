"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "@/store";
import { useIsMobile } from "@/hooks/useMediaQuery";
import type { ThemeName } from "@/types/theme";
import {
  Grid3X3,
  Volume2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Settings,
  Wifi,
  Bluetooth,
  Moon,
  Flashlight,
  Sun,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const THEMES: { name: ThemeName; color: string; label: string }[] = [
  { name: "retro", color: "#ff9f1c", label: "Retro" },
  { name: "neon", color: "#ff00ff", label: "Neon" },
  { name: "editorial", color: "#f7a501", label: "Editorial" },
];

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function buildCalendarGrid(year: number, month: number): (number | null)[] {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const prevMonthDays = month > 0 ? getDaysInMonth(year, month - 1) : 31;
  const grid: (number | null)[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    grid.push(prevMonthDays - i);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    grid.push(d);
  }
  const remaining = 42 - grid.length;
  for (let i = 1; i <= remaining; i++) {
    grid.push(i);
  }
  return grid;
}

export function TopBar() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileTopBar /> : <DesktopTopBar />;
}

/* ── Desktop Top Bar ───────────────────────────────── */

function DesktopTopBar() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const [controlOpen, setControlOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setDate(now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const fullDate = useMemo(() => {
    return new Date().toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  const handleTimeMouseEnter = useCallback(() => {
    if (calendarOpen) return;
    leaveTimeoutRef.current && clearTimeout(leaveTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setHoverOpen(true), 400);
  }, [calendarOpen]);

  const handleTimeMouseLeave = useCallback(() => {
    hoverTimeoutRef.current && clearTimeout(hoverTimeoutRef.current);
    leaveTimeoutRef.current = setTimeout(() => setHoverOpen(false), 300);
  }, []);

  const handleTooltipMouseEnter = useCallback(() => {
    leaveTimeoutRef.current && clearTimeout(leaveTimeoutRef.current);
  }, []);

  const handleTooltipMouseLeave = useCallback(() => {
    leaveTimeoutRef.current = setTimeout(() => setHoverOpen(false), 200);
  }, []);

  useEffect(() => {
    if (!controlOpen && !calendarOpen) return;
    const close = (e: PointerEvent) => {
      const panel = document.getElementById("desktop-control-panel");
      const trigger = document.getElementById("desktop-control-trigger");
      const calPanel = document.getElementById("desktop-calendar-panel");
      const calTrigger = document.getElementById("desktop-calendar-trigger");
      if (panel && !panel.contains(e.target as Node) && trigger && !trigger.contains(e.target as Node)) {
        setControlOpen(false);
      }
      if (calPanel && !calPanel.contains(e.target as Node) && calTrigger && !calTrigger.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setControlOpen(false);
        setCalendarOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", handleKey);
    };
  }, [controlOpen, calendarOpen]);

  useEffect(() => {
    return () => {
      hoverTimeoutRef.current && clearTimeout(hoverTimeoutRef.current);
      leaveTimeoutRef.current && clearTimeout(leaveTimeoutRef.current);
    };
  }, []);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-between px-4 glass-heavy"
      style={{
        height: 36,
        borderBottom: "1px solid color-mix(in srgb, var(--accent-1) 10%, transparent)",
        boxShadow: "0 2px 8px color-mix(in srgb, var(--bg-primary) 40%, transparent)",
      }}
    >
      <span className="font-display text-xs tracking-wide" style={{ color: "var(--accent-1)" }}>
        DevOS
      </span>

      {/* Time / Date + Calendar */}
      <div className="relative">
        <button
          id="desktop-calendar-trigger"
          onClick={() => { setCalendarOpen((v) => !v); setControlOpen(false); setHoverOpen(false); }}
          onMouseEnter={handleTimeMouseEnter}
          onMouseLeave={handleTimeMouseLeave}
          className="flex flex-col items-center px-3 py-1 rounded-lg transition-all hover:bg-[color-mix(in_srgb,var(--accent-1)_8%,transparent)]"
          aria-label="Calendar"
        >
          <span className="font-display text-xs leading-tight">{time}</span>
          <span className="text-[9px] leading-tight" style={{ color: "var(--text-secondary)" }}>{date}</span>
        </button>

        {/* Hover tooltip: shows full date when hovering (not when calendar is open) */}
        <AnimatePresence>
          {hoverOpen && !calendarOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
              className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-3 py-2 glass-heavy whitespace-nowrap"
              style={{
                borderRadius: "var(--radius)",
                border: "1px solid color-mix(in srgb, var(--accent-1) 15%, transparent)",
                boxShadow: "var(--shadow-glass)",
                zIndex: 10000,
                color: "var(--text-primary)",
              }}
              onMouseEnter={handleTooltipMouseEnter}
              onMouseLeave={handleTooltipMouseLeave}
            >
              <span className="font-display text-[11px]">{fullDate}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {calendarOpen && (
            <motion.div
              id="desktop-calendar-panel"
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
              className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-[260px] glass-heavy overflow-hidden"
              style={{
                borderRadius: "var(--radius)",
                border: "1px solid color-mix(in srgb, var(--accent-1) 15%, transparent)",
                boxShadow: "var(--shadow-glass-heavy)",
                zIndex: 10000,
              }}
            >
              <CalendarPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Control Center */}
      <div className="relative">
        <button
          id="desktop-control-trigger"
          onClick={() => { setControlOpen((v) => !v); setCalendarOpen(false); }}
          className="flex items-center justify-center w-7 h-7 rounded-lg transition-all hover:scale-110 active:scale-95"
          style={{
            background: controlOpen ? "color-mix(in srgb, var(--accent-1) 15%, transparent)" : "transparent",
            color: controlOpen ? "var(--accent-1)" : "var(--text-secondary)",
          }}
          aria-label="Control Center"
        >
          <Grid3X3 size={15} />
        </button>

        <AnimatePresence>
          {controlOpen && (
            <motion.div
              id="desktop-control-panel"
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
              className="absolute right-0 top-full mt-2 w-[260px] glass-heavy overflow-hidden"
              style={{
                borderRadius: "var(--radius)",
                border: "1px solid color-mix(in srgb, var(--accent-1) 15%, transparent)",
                boxShadow: "var(--shadow-glass-heavy)",
                zIndex: 10000,
              }}
            >
              <DesktopControlContent onClose={() => setControlOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Calendar Panel ────────────────────────────────── */

function CalendarPanel() {
  const now = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());

  const grid = useMemo(() => buildCalendarGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const today = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  return (
    <div className="p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => {
            if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
            else { setViewMonth((m) => m - 1); }
          }}
          className="w-6 h-6 flex items-center justify-center rounded transition-all hover:bg-[color-mix(in_srgb,var(--accent-1)_12%,transparent)] hover:scale-110 active:scale-95"
          aria-label="Previous month"
        >
          <ChevronLeft size={14} style={{ color: "var(--text-secondary)" }} />
        </button>
        <span className="font-display text-[11px]">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={() => {
            if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
            else { setViewMonth((m) => m + 1); }
          }}
          className="w-6 h-6 flex items-center justify-center rounded transition-all hover:bg-[color-mix(in_srgb,var(--accent-1)_12%,transparent)] hover:scale-110 active:scale-95"
          aria-label="Next month"
        >
          <ChevronRight size={14} style={{ color: "var(--text-secondary)" }} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-[9px] font-body py-1" style={{ color: "var(--text-secondary)" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7">
        {grid.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />;

          const isCurrentMonth = i >= getFirstDayOfWeek(viewYear, viewMonth) &&
            i < getFirstDayOfWeek(viewYear, viewMonth) + getDaysInMonth(viewYear, viewMonth);
          const isToday = isCurrentMonth && day === today && viewMonth === todayMonth && viewYear === todayYear;

          return (
            <div
              key={`d${i}`}
              className="flex items-center justify-center text-[10px] font-body h-7 rounded-full transition-all duration-150 hover:scale-110 cursor-default"
              style={{
                color: isCurrentMonth ? "var(--text-primary)" : "color-mix(in srgb, var(--text-secondary) 40%, transparent)",
                background: isToday ? "var(--accent-1)" : "transparent",
                fontWeight: isToday ? 700 : 400,
                boxShadow: isToday ? "0 0 8px color-mix(in srgb, var(--accent-1) 40%, transparent)" : undefined,
              }}
              onMouseEnter={(e) => {
                if (!isToday) {
                  (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--accent-1) 12%, transparent)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isToday) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }
              }}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Desktop Control Center Content ─────────────────── */

function DesktopControlContent({ onClose }: { onClose: () => void }) {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const volume = useStore((s) => s.volume);
  const setVolume = useStore((s) => s.setVolume);
  const isPlaying = useStore((s) => s.isPlaying);
  const currentTrack = useStore((s) => s.currentTrack);
  const togglePlay = useStore((s) => s.togglePlay);
  const nextTrack = useStore((s) => s.nextTrack);
  const prevTrack = useStore((s) => s.prevTrack);
  const openWindow = useStore((s) => s.openWindow);
  const windows = useStore((s) => s.windows);
  const glassBlur = useStore((s) => s.glassBlur);
  const glassSaturate = useStore((s) => s.glassSaturate);
  const glassOpacity = useStore((s) => s.glassOpacity);
  const setGlassBlur = useStore((s) => s.setGlassBlur);
  const setGlassSaturate = useStore((s) => s.setGlassSaturate);
  const setGlassOpacity = useStore((s) => s.setGlassOpacity);

  const handleOpenSettings = () => {
    const existing = windows.find((w) => w.component === "control-panel");
    if (existing) {
      if (existing.isMinimized) useStore.getState().restoreWindow(existing.id);
      useStore.getState().focusWindow(existing.id);
    } else {
      openWindow({ title: "Control Panel", type: "app", component: "control-panel" });
    }
    onClose();
  };

  return (
    <div className="flex flex-col p-3 gap-3">
      <div className="flex items-center justify-between">
        <span className="font-display text-[10px] text-os-accent">Control Center</span>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded hover:opacity-70 transition-opacity"
          style={{ color: "var(--text-secondary)" }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div>
        <span className="text-[10px] font-body block mb-1.5" style={{ color: "var(--text-secondary)" }}>Theme</span>
        <div className="flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.name}
              onClick={() => setTheme(t.name)}
              className="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-lg transition-all"
              style={{
                background: theme === t.name ? "color-mix(in srgb, var(--accent-1) 15%, transparent)" : "transparent",
                border: theme === t.name ? "1px solid color-mix(in srgb, var(--accent-1) 30%, transparent)" : "1px solid transparent",
              }}
            >
              <span
                className="w-4 h-4 rounded-full border-2"
                style={{
                  background: t.color,
                  borderColor: theme === t.name ? "var(--accent-1)" : "transparent",
                  boxShadow: theme === t.name ? `0 0 8px ${t.color}60` : "none",
                }}
              />
              <span className="text-[9px] font-body">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="h-px" style={{ background: "color-mix(in srgb, var(--accent-1) 10%, transparent)" }} />

      <div>
        <span className="text-[10px] font-body block mb-1.5" style={{ color: "var(--text-secondary)" }}>Glass</span>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <label className="text-[9px] w-10 flex-shrink-0" style={{ color: "var(--text-secondary)" }}>Blur</label>
            <input type="range" min={0} max={40} value={glassBlur} onChange={(e) => setGlassBlur(Number(e.target.value))} className="flex-1 h-1 accent-os-accent cursor-pointer" aria-label="Glass blur" />
            <span className="text-[8px] w-5 text-right" style={{ color: "var(--text-secondary)" }}>{glassBlur}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[9px] w-10 flex-shrink-0" style={{ color: "var(--text-secondary)" }}>Sat</label>
            <input type="range" min={100} max={250} step={5} value={glassSaturate} onChange={(e) => setGlassSaturate(Number(e.target.value))} className="flex-1 h-1 accent-os-accent cursor-pointer" aria-label="Glass saturation" />
            <span className="text-[8px] w-5 text-right" style={{ color: "var(--text-secondary)" }}>{glassSaturate}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[9px] w-10 flex-shrink-0" style={{ color: "var(--text-secondary)" }}>Tint</label>
            <input type="range" min={5} max={100} step={5} value={glassOpacity} onChange={(e) => setGlassOpacity(Number(e.target.value))} className="flex-1 h-1 accent-os-accent cursor-pointer" aria-label="Glass tint" />
            <span className="text-[8px] w-5 text-right" style={{ color: "var(--text-secondary)" }}>{glassOpacity}%</span>
          </div>
        </div>
      </div>

      <div className="h-px" style={{ background: "color-mix(in srgb, var(--accent-1) 10%, transparent)" }} />

      <div className="flex items-center gap-2">
        <Volume2 size={12} style={{ color: "var(--text-secondary)" }} />
        <input
          type="range" min={0} max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          className="flex-1 h-1 accent-os-accent cursor-pointer"
          aria-label="Volume"
        />
        <span className="text-[9px] font-body w-6 text-right" style={{ color: "var(--text-secondary)" }}>
          {Math.round(volume * 100)}
        </span>
      </div>

      <div className="h-px" style={{ background: "color-mix(in srgb, var(--accent-1) 10%, transparent)" }} />

      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-display truncate">{currentTrack.title}</div>
          <div className="text-[9px] truncate" style={{ color: "var(--text-secondary)" }}>{currentTrack.artist}</div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={prevTrack} className="w-6 h-6 flex items-center justify-center rounded-lg hover:opacity-70 transition-opacity" style={{ background: "color-mix(in srgb, var(--bg-tertiary) 60%, transparent)" }} aria-label="Previous">
            <SkipBack size={10} />
          </button>
          <button onClick={togglePlay} className="w-7 h-7 flex items-center justify-center rounded-lg transition-opacity hover:opacity-80" style={{ background: "var(--accent-1)", color: "var(--bg-primary)" }} aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button onClick={nextTrack} className="w-6 h-6 flex items-center justify-center rounded-lg hover:opacity-70 transition-opacity" style={{ background: "color-mix(in srgb, var(--bg-tertiary) 60%, transparent)" }} aria-label="Next">
            <SkipForward size={10} />
          </button>
        </div>
      </div>

      <div className="h-px" style={{ background: "color-mix(in srgb, var(--accent-1) 10%, transparent)" }} />

      <button
        onClick={handleOpenSettings}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-body transition-all hover:opacity-80"
        style={{ background: "color-mix(in srgb, var(--bg-tertiary) 60%, transparent)", color: "var(--text-primary)" }}
      >
        <Settings size={12} /> Settings
      </button>
    </div>
  );
}

/* ── Mobile Top Bar ────────────────────────────────── */

function MobileTopBar() {
  const [time, setTime] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelY, setPanelY] = useState(-400);
  const [animating, setAnimating] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startY: 0, startPanelY: 0, isDragging: false, lastTime: 0, velocity: 0 });

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    };
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);

  const snapTo = useCallback((target: number) => {
    setAnimating(true);
    setPanelY(target);
    setTimeout(() => setAnimating(false), 300);
    setPanelOpen(target > -200);
  }, []);

  const handleKnobPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = panelRef.current?.getBoundingClientRect();
    const panelHeight = rect ? rect.height : 400;
    dragRef.current = {
      startY: e.clientY,
      startPanelY: panelOpen ? 0 : -panelHeight,
      isDragging: true,
      lastTime: Date.now(),
      velocity: 0,
    };
    setAnimating(false);
    setPanelY(panelOpen ? 0 : -panelHeight);
  }, [panelOpen]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.isDragging) return;
    const delta = e.clientY - dragRef.current.startY;
    const now = Date.now();
    const dt = now - dragRef.current.lastTime;
    if (dt > 0) {
      dragRef.current.velocity = delta / dt;
    }
    dragRef.current.lastTime = now;
    const rect = panelRef.current?.getBoundingClientRect();
    const panelHeight = rect ? rect.height : 400;
    const newY = Math.max(-panelHeight, Math.min(0, dragRef.current.startPanelY + delta));
    setPanelY(newY);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current.isDragging) return;
    dragRef.current.isDragging = false;
    const rect = panelRef.current?.getBoundingClientRect();
    const panelHeight = rect ? rect.height : 400;
    const vel = dragRef.current.velocity;
    if (vel > 0.3 || panelY > -panelHeight * 0.3) {
      snapTo(0);
    } else {
      snapTo(-panelHeight);
    }
  }, [panelY, snapTo]);

  const handleKnobClick = useCallback(() => {
    if (dragRef.current.isDragging) return;
    const rect = panelRef.current?.getBoundingClientRect();
    const panelHeight = rect ? rect.height : 400;
    if (panelOpen) {
      snapTo(-panelHeight);
    } else {
      snapTo(0);
    }
  }, [panelOpen, snapTo]);

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999]">
      {/* Status bar */}
      <div className="flex items-center justify-center h-6 glass-heavy" style={{ borderBottom: "1px solid color-mix(in srgb, var(--accent-1) 10%, transparent)" }}>
        <span className="font-display text-[10px]">{time}</span>
      </div>

      {/* Drag knob (tappable + draggable) */}
      <div
        className="relative z-20 flex justify-center py-0.5 cursor-grab active:cursor-grabbing"
        onPointerDown={handleKnobPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleKnobClick}
        style={{ touchAction: "none" }}
      >
        <div
          className="w-10 h-1.5 rounded-full transition-colors"
          style={{
            background: panelOpen
              ? "var(--accent-1)"
              : "color-mix(in srgb, var(--text-secondary) 50%, transparent)",
            boxShadow: panelOpen ? "0 0 8px color-mix(in srgb, var(--accent-1) 40%, transparent)" : "none",
          }}
        />
      </div>

      {/* Panel (always rendered, translateY-controlled) */}
      <div
        ref={panelRef}
        className="fixed left-0 right-0 z-[10000] glass-heavy overflow-y-auto"
        style={{
          top: 32,
          maxHeight: "60vh",
          borderBottomLeftRadius: "var(--radius)",
          borderBottomRightRadius: "var(--radius)",
          border: "1px solid color-mix(in srgb, var(--accent-1) 15%, transparent)",
          borderTop: "none",
          boxShadow: "var(--shadow-glass-heavy)",
          transform: `translateY(${panelY}px)`,
          transition: animating ? "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)" : "none",
          pointerEvents: panelY > -200 ? "auto" : "none",
          touchAction: "none",
        }}
      >
        <MobileControlContent onClose={() => snapTo(-400)} />
      </div>

      {/* Backdrop */}
      <AnimatePresence>
        {panelY > -200 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999]"
            style={{ background: "rgba(0,0,0,0.3)", top: 32, pointerEvents: panelY > -200 ? "auto" : "none" }}
            onClick={() => snapTo(-400)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Mobile Control Panel Content ───────────────────── */

function MobileControlContent({ onClose }: { onClose: () => void }) {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const volume = useStore((s) => s.volume);
  const setVolume = useStore((s) => s.setVolume);
  const openWindow = useStore((s) => s.openWindow);
  const windows = useStore((s) => s.windows);
  const glassBlur = useStore((s) => s.glassBlur);
  const setGlassBlur = useStore((s) => s.setGlassBlur);

  const handleOpenSettings = () => {
    const existing = windows.find((w) => w.component === "control-panel");
    if (existing) {
      if (existing.isMinimized) useStore.getState().restoreWindow(existing.id);
      useStore.getState().focusWindow(existing.id);
    } else {
      openWindow({ title: "Control Panel", type: "app", component: "control-panel" });
    }
    onClose();
  };

  const toggles = [
    { icon: Wifi, label: "Wi-Fi", active: true },
    { icon: Bluetooth, label: "Bluetooth", active: false },
    { icon: Moon, label: "DND", active: false },
    { icon: Flashlight, label: "Flash", active: false },
  ];

  return (
    <div className="flex flex-col p-3 gap-3">
      <div className="grid grid-cols-4 gap-2">
        {toggles.map((t) => (
          <button
            key={t.label}
            className="flex flex-col items-center gap-1 py-2 rounded-xl transition-all"
            style={{
              background: t.active ? "color-mix(in srgb, var(--accent-1) 20%, transparent)" : "color-mix(in srgb, var(--bg-tertiary) 60%, transparent)",
              color: t.active ? "var(--accent-1)" : "var(--text-secondary)",
            }}
          >
            <t.icon size={16} />
            <span className="text-[8px] font-body">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="h-px" style={{ background: "color-mix(in srgb, var(--accent-1) 10%, transparent)" }} />

      <div className="flex items-center gap-2">
        <Sun size={14} style={{ color: "var(--text-secondary)" }} />
        <div className="flex-1 h-1 rounded-full" style={{ background: "var(--bg-tertiary)" }}>
          <div className="h-full w-3/4 rounded-full" style={{ background: "var(--accent-1)" }} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] font-body w-5 flex-shrink-0" style={{ color: "var(--text-secondary)" }}>Glass</span>
        <input type="range" min={0} max={40} value={glassBlur} onChange={(e) => setGlassBlur(Number(e.target.value))} className="flex-1 h-1 accent-os-accent cursor-pointer" aria-label="Glass blur" />
        <span className="text-[10px] w-6 text-right" style={{ color: "var(--text-secondary)" }}>{glassBlur}px</span>
      </div>

      <div className="flex items-center gap-2">
        <Volume2 size={14} style={{ color: "var(--text-secondary)" }} />
        <input
          type="range" min={0} max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          className="flex-1 h-1 accent-os-accent cursor-pointer"
          aria-label="Volume"
        />
        <span className="text-[10px] font-body w-6 text-right" style={{ color: "var(--text-secondary)" }}>
          {Math.round(volume * 100)}
        </span>
      </div>

      <div className="h-px" style={{ background: "color-mix(in srgb, var(--accent-1) 10%, transparent)" }} />

      <div className="flex items-center gap-3 justify-center">
        {THEMES.map((t) => (
          <button
            key={t.name}
            onClick={() => setTheme(t.name)}
            className="w-8 h-8 rounded-full border-2 transition-all"
            style={{
              background: t.color,
              borderColor: theme === t.name ? "var(--accent-1)" : "transparent",
              boxShadow: theme === t.name ? `0 0 10px ${t.color}60` : "none",
            }}
            aria-label={t.label}
          />
        ))}
      </div>

      <div className="h-px" style={{ background: "color-mix(in srgb, var(--accent-1) 10%, transparent)" }} />

      <button
        onClick={handleOpenSettings}
        className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[11px] font-body transition-all hover:opacity-80"
        style={{ background: "color-mix(in srgb, var(--bg-tertiary) 60%, transparent)", color: "var(--text-primary)" }}
      >
        <Settings size={13} /> Settings
      </button>
    </div>
  );
}
