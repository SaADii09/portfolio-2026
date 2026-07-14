"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { useStore } from "@/store";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useLongPress } from "@/hooks/useLongPress";
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
import { ContextMenu } from "@/components/os/ContextMenu";
import {
  User,
  FolderKanban,
  FileText,
  Terminal,
  Mail,
  Settings,
  RefreshCw,
  Monitor,
  Info,
} from "lucide-react";

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [iconContextMenu, setIconContextMenu] = useState<{
    component: string;
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    addWidget("weather", "Weather", w - 220, 130);
    addWidget("cpu", "CPU", w - 220, 240);
    addWidget("music", "Music", w - 220, 350);
    addWidget("notes", "Notes", w - 220, 460);

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

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => {
      window.location.reload();
    }, 350);
  }, []);

  const handleOpenApp = useCallback(
    (component: string, title: string) => {
      const existing = windows.find((w) => w.component === component);
      if (existing) {
        if (existing.isMinimized) useStore.getState().restoreWindow(existing.id);
        useStore.getState().focusWindow(existing.id);
        return;
      }
      openWindow({ title, type: "app", component });
    },
    [windows, openWindow],
  );

  const openIconContextMenu = useCallback(
    (component: string, label: string, e: React.MouseEvent | React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIconContextMenu({ component, label, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const getIconMenuItems = useCallback(
    (component: string, label: string) => [
      {
        label: "Open",
        icon: Monitor,
        onClick: () => handleOpenApp(component, label),
      },
      { label: "", separator: true as const, onClick: () => {} },
      {
        label: "Properties",
        icon: Info,
        onClick: () => {
          const existing = windows.find((w) => w.component === "about");
          if (existing) {
            if (existing.isMinimized) useStore.getState().restoreWindow(existing.id);
            useStore.getState().focusWindow(existing.id);
          } else {
            openWindow({ title: "About Me", type: "app", component: "about" });
          }
        },
      },
    ],
    [handleOpenApp, windows, openWindow],
  );

  const contextMenuItems = [
    {
      label: "Refresh",
      icon: RefreshCw,
      onClick: handleRefresh,
    },
    { label: "", separator: true as const, onClick: () => {} },
    ...DESKTOP_ICONS.map((app) => ({
      label: app.label,
      icon: app.icon,
      onClick: () => handleOpenApp(app.component, app.label),
    })),
    { label: "", separator: true as const, onClick: () => {} },
    {
      label: "About DevOS",
      icon: Info,
      onClick: () => handleOpenApp("about", "About Me"),
    },
  ];

  if (isMobile) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-os-bg">
        <div className="absolute inset-0 pb-[var(--taskbar-height,52px)] overflow-auto">
          <div className="flex gap-3 p-3 overflow-x-auto flex-shrink-0">
            {widgets.map((w) => (
              <WidgetWrapper key={w.id} id={w.id}>
                {renderWidgetContent(w.type, w.id)}
              </WidgetWrapper>
            ))}
          </div>

          <div className="flex items-center justify-center">
            <div className="grid grid-cols-3 gap-4 p-4">
              {DESKTOP_ICONS.map((app) => (
                <DesktopIconMobile
                  key={app.id}
                  app={app}
                  onDoubleClick={() => handleIconDoubleClick(app)}
                  onContextMenu={(e) => openIconContextMenu(app.component, app.label, e)}
                />
              ))}
            </div>
          </div>
        </div>

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

        <AnimatePresence>
          {iconContextMenu && (
            <ContextMenu
              items={getIconMenuItems(iconContextMenu.component, iconContextMenu.label)}
              position={{ x: iconContextMenu.x, y: iconContextMenu.y }}
              onClose={() => setIconContextMenu(null)}
            />
          )}
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

      <div className="flex-1 relative overflow-hidden" onContextMenu={handleContextMenu}>
        <div
          className={`absolute top-4 left-4 flex flex-col gap-4 z-10 ${isRefreshing ? "os-refresh-blink" : ""}`}
        >
          {DESKTOP_ICONS.map((app) => (
            <button
              key={app.id}
              onDoubleClick={() => handleIconDoubleClick(app)}
              onContextMenu={(e) => openIconContextMenu(app.component, app.label, e)}
              className="flex flex-col items-center gap-1 w-16 p-1.5 rounded-os transition-all hover:scale-110 active:scale-95 focus:outline-none focus:ring-1 focus:ring-os-accent"
              title={`Open ${app.label}`}
            >
              <div className="w-10 h-10 flex items-center justify-center rounded-os glass glass-border transition-all hover:glow-sm">
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

      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            items={contextMenuItems}
            position={contextMenu}
            onClose={() => setContextMenu(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {iconContextMenu && (
          <ContextMenu
            items={getIconMenuItems(iconContextMenu.component, iconContextMenu.label)}
            position={{ x: iconContextMenu.x, y: iconContextMenu.y }}
            onClose={() => setIconContextMenu(null)}
          />
        )}
      </AnimatePresence>

      <Taskbar />
    </div>
  );
}

function DesktopIconMobile({
  app,
  onDoubleClick,
  onContextMenu,
}: {
  app: (typeof DESKTOP_ICONS)[number];
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent | React.PointerEvent) => void;
}) {
  const longPress = useLongPress({ onLongPress: onContextMenu });

  return (
    <button
      onClick={onDoubleClick}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onContextMenu={longPress.onContextMenu}
      className="flex flex-col items-center gap-1.5 p-2 rounded-os transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-1 focus:ring-os-accent"
      title={`Open ${app.label}`}
    >
      <div className="w-12 h-12 flex items-center justify-center rounded-os glass glass-border transition-all hover:glow-sm">
        <app.icon size={22} className="text-os-accent" />
      </div>
      <span className="text-[10px] font-body text-center leading-tight text-os-text">
        {app.label}
      </span>
    </button>
  );
}
