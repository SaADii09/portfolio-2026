"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { useStore } from "@/store";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { Window } from "@/components/os/Window";
import { Taskbar } from "@/components/os/Taskbar";
import { ChatPanel } from "@/components/os/ChatPanel";
import { Wallpaper } from "@/components/os/Wallpaper";
import { WebView } from "@/components/os/WebView";
import { WidgetWrapper } from "@/components/widgets/WidgetWrapper";
import { ClockWidget } from "@/components/widgets/ClockWidget";
import { CpuWidget } from "@/components/widgets/CpuWidget";
import { WeatherWidget } from "@/components/widgets/WeatherWidget";
import { MusicWidget } from "@/components/widgets/MusicWidget";
import { NotesWidget } from "@/components/widgets/NotesWidget";
import { AboutApp } from "@/components/apps/AboutApp";
import { ProjectsApp } from "@/components/apps/ProjectsApp";
import { ControlPanelApp } from "@/components/apps/ControlPanelApp";
import { TerminalApp } from "@/components/apps/TerminalApp";
import { ContactApp } from "@/components/apps/ContactApp";
import { ResumeApp } from "@/components/apps/ResumeApp";
import { User, FolderKanban, FileText, Terminal, Mail, Settings } from "lucide-react";

const DESKTOP_ICONS = [
  { id: "about", label: "About Me", icon: User, component: "about" },
  { id: "projects", label: "Projects", icon: FolderKanban, component: "projects" },
  { id: "control-panel", label: "Settings", icon: Settings, component: "control-panel" },
  { id: "resume", label: "Resume", icon: FileText, component: "resume" },
  { id: "terminal", label: "Terminal", icon: Terminal, component: "terminal" },
  { id: "contact", label: "Contact", icon: Mail, component: "contact" },
];

function renderAppContent(component?: string, url?: string) {
  switch (component) {
    case "about":
      return <AboutApp />;
    case "projects":
      return <ProjectsApp />;
    case "control-panel":
      return <ControlPanelApp />;
    case "terminal":
      return <TerminalApp />;
    case "contact":
      return <ContactApp />;
    case "resume":
      return <ResumeApp />;
    default:
      if (url) return <WebView url={url} />;
      return (
        <div className="flex items-center justify-center h-full opacity-50 font-body text-os-muted">
          {component ? `${component} — coming soon` : "Select an app from the Start menu"}
        </div>
      );
  }
}

function renderWidgetContent(type: string, widgetId: string) {
  switch (type) {
    case "clock":
      return <ClockWidget />;
    case "cpu":
      return <CpuWidget />;
    case "weather":
      return <WeatherWidget />;
    case "music":
      return <MusicWidget />;
    case "notes":
      return <NotesWidget id={widgetId} />;
    default:
      return null;
  }
}

export function Desktop() {
  const windows = useStore((s) => s.windows);
  const widgets = useStore((s) => s.widgets);
  const openWindow = useStore((s) => s.openWindow);
  const addWidget = useStore((s) => s.addWidget);
  const clampAllWindows = useStore((s) => s.clampAllWindows);
  const initDone = useRef(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const state = useStore.getState();
    const seen = new Set<string>();
    const deduped: typeof state.widgets = [];
    for (const w of state.widgets) {
      if (!seen.has(w.type)) {
        seen.add(w.type);
        deduped.push(w);
      }
    }
    if (deduped.length !== state.widgets.length) {
      useStore.setState({ widgets: deduped });
    }

    if (deduped.length > 0) return;

    const w = typeof window !== "undefined" ? window.innerWidth : 1024;

    addWidget("clock", "Clock", w - 220, 20);
    addWidget("weather", "Weather", w - 220, 110);
    addWidget("cpu", "CPU", w - 220, 200);
    addWidget("music", "Music", w - 220, 290);
    addWidget("notes", "Notes", w - 220, 380);

    clampAllWindows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleIconDoubleClick = (app: (typeof DESKTOP_ICONS)[number]) => {
    const existing = windows.find((w) => w.component === app.component);
    if (existing) {
      if (existing.isMinimized) {
        useStore.getState().restoreWindow(existing.id);
      }
      useStore.getState().focusWindow(existing.id);
      return;
    }
    openWindow({
      title: app.label,
      type: "app",
      component: app.component,
    });
  };

  if (isMobile) {
    return (
      <div className="relative w-full h-screen overflow-hidden flex flex-col bg-os-bg">
        {windows.length === 0 && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex gap-3 p-3 overflow-x-auto flex-shrink-0">
              {widgets.map((w) => (
                <WidgetWrapper key={w.id} id={w.id}>
                  {renderWidgetContent(w.type, w.id)}
                </WidgetWrapper>
              ))}
            </div>

            <div className="flex-1 flex items-center justify-center">
              <div className="grid grid-cols-3 gap-4 p-4">
                {DESKTOP_ICONS.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => handleIconDoubleClick(app)}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-os transition-colors hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-os-accent"
                    title={`Open ${app.label}`}
                  >
                    <div className="w-12 h-12 flex items-center justify-center rounded-os bg-os-surface">
                      <app.icon size={22} className="text-os-accent" />
                    </div>
                    <span className="text-[10px] font-body text-center leading-tight text-os-text">
                      {app.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <AnimatePresence>
          {windows
            .filter((w) => !w.isMinimized)
            .map((w) => (
              <Window key={w.id} id={w.id}>
                {w.type === "iframe" && w.url ? (
                  <WebView url={w.url} />
                ) : (
                  renderAppContent(w.component)
                )}
              </Window>
            ))}
        </AnimatePresence>

        <ChatPanel />
        <Taskbar />
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden flex flex-col bg-os-bg">
      <Wallpaper />
      <ChatPanel />

      <div className="flex-1 relative overflow-hidden">
        <div className="absolute top-4 left-4 flex flex-col gap-4 z-10">
          {DESKTOP_ICONS.map((app) => (
            <button
              key={app.id}
              onDoubleClick={() => handleIconDoubleClick(app)}
              className="flex flex-col items-center gap-1 w-16 p-1.5 rounded-os transition-colors hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-os-accent"
              title={`Open ${app.label}`}
            >
              <div className="w-10 h-10 flex items-center justify-center rounded-os bg-os-surface">
                <app.icon size={22} className="text-os-accent" />
              </div>
              <span className="text-[10px] font-body text-center leading-tight text-os-text">
                {app.label}
              </span>
            </button>
          ))}
        </div>

        {/* Widgets */}
        {widgets.map((w) => (
          <WidgetWrapper key={w.id} id={w.id}>
            {renderWidgetContent(w.type, w.id)}
          </WidgetWrapper>
        ))}

        {/* Windows */}
        <AnimatePresence>
          {windows
            .filter((w) => !w.isMinimized)
            .map((w) => (
              <Window key={w.id} id={w.id}>
                {w.type === "iframe" && w.url ? (
                  <WebView url={w.url} />
                ) : (
                  renderAppContent(w.component)
                )}
              </Window>
            ))}
        </AnimatePresence>
      </div>

      <Taskbar />
    </div>
  );
}
