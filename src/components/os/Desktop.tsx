"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { useStore } from "@/store";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useLongPress } from "@/hooks/useLongPress";
import { useViewportClamp } from "@/hooks/useViewportClamp";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { getViewportBounds } from "@/lib/boundaries";
import { Window } from "@/components/os/Window";
import { Dock } from "@/components/os/Dock";
import { TopBar } from "@/components/os/TopBar";
import { Taskbar } from "@/components/os/Taskbar";
import { ChatPanel } from "@/components/os/ChatPanel";
import { Wallpaper } from "@/components/os/Wallpaper";
import { WebView } from "@/components/os/WebView";
import { WidgetWrapper } from "@/components/widgets/WidgetWrapper";
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
import { CommandPalette } from "@/components/os/CommandPalette";
import { APP_ICONS } from "@/components/os/appIcons";
import { APP_DEFS, type AppDef, type AppId } from "@/lib/apps";
import { openApp } from "@/lib/os-actions";
import { RefreshCw, Monitor, Info } from "lucide-react";

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
  const addWidget = useStore((s) => s.addWidget);
  const clampAllWindows = useStore((s) => s.clampAllWindows);
  const isPaletteOpen = useStore((s) => s.isPaletteOpen);
  const initDone = useRef(false);
  const isMobile = useIsMobile();
  useViewportClamp();
  useKeyboardShortcuts();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [iconContextMenu, setIconContextMenu] = useState<{
    id: AppId;
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

    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
    const bounds = getViewportBounds(vw);

    addWidget("weather", "Weather", vw - 220, bounds.topBar + 10);
    addWidget("cpu", "CPU", vw - 220, bounds.topBar + 120);
    addWidget("music", "Music", vw - 220, bounds.topBar + 230);
    addWidget("notes", "Notes", vw - 220, bounds.topBar + 340);

    clampAllWindows();
    const store = useStore.getState();
    store.clampAllWidgets();
    store.resolveAllWidgetCollisions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleIconDoubleClick = (app: AppDef) => {
    openApp(app.id);
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

  const openIconContextMenu = useCallback((id: AppId, e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIconContextMenu({ id, x: e.clientX, y: e.clientY });
  }, []);

  const getIconMenuItems = useCallback(
    (id: AppId) => [
      {
        label: "Open",
        icon: Monitor,
        onClick: () => openApp(id),
      },
      { label: "", separator: true as const, onClick: () => {} },
      {
        label: "Properties",
        icon: Info,
        onClick: () => openApp("about"),
      },
    ],
    [],
  );

  const contextMenuItems = [
    {
      label: "Refresh",
      icon: RefreshCw,
      onClick: handleRefresh,
    },
    { label: "", separator: true as const, onClick: () => {} },
    ...APP_DEFS.map((app) => ({
      label: app.desktopLabel ?? app.title,
      icon: APP_ICONS[app.id],
      onClick: () => openApp(app.id),
    })),
    { label: "", separator: true as const, onClick: () => {} },
    {
      label: "About DevOS",
      icon: Info,
      onClick: () => openApp("about"),
    },
  ];

  if (isMobile) {
    return (
      <MotionConfig reducedMotion="user">
        <div className="relative w-full h-screen overflow-hidden bg-os-bg">
          <TopBar />

          {/* Desktop surface: widgets + icons — scrollable */}
          <div className="absolute inset-0 pb-[var(--taskbar-height,52px)] pt-8 overflow-auto">
            <div className="flex gap-3 p-3 overflow-x-auto flex-shrink-0">
              {widgets.map((w) => (
                <WidgetWrapper key={w.id} id={w.id}>
                  {renderWidgetContent(w.type, w.id)}
                </WidgetWrapper>
              ))}
            </div>

            <div className="flex items-center justify-center">
              <div className="grid grid-cols-3 gap-4 p-4">
                {APP_DEFS.map((app) => (
                  <DesktopIconMobile
                    key={app.id}
                    app={app}
                    onDoubleClick={() => handleIconDoubleClick(app)}
                    onContextMenu={(e) => openIconContextMenu(app.id, e)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Mobile content zone: physically bounded between status bar and taskbar */}
          <div
            className="absolute overflow-hidden pointer-events-none"
            style={{ top: 32, bottom: 52, left: 0, right: 0 }}
          >
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
            {iconContextMenu && (
              <ContextMenu
                items={getIconMenuItems(iconContextMenu.id)}
                position={{ x: iconContextMenu.x, y: iconContextMenu.y }}
                onClose={() => setIconContextMenu(null)}
              />
            )}
          </AnimatePresence>

          <ChatPanel />
          <Taskbar />

          <AnimatePresence>{isPaletteOpen && <CommandPalette />}</AnimatePresence>
        </div>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative w-full h-screen overflow-hidden bg-os-bg">
        <Wallpaper />
        <TopBar />
        <ChatPanel />

        {/* Content safe zone: physically bounded between TopBar and Dock */}
        <div
          className="absolute overflow-hidden"
          style={{ top: 36, bottom: 76, left: 0, right: 0 }}
          onContextMenu={handleContextMenu}
        >
          <div
            className={`absolute top-4 left-4 flex flex-col gap-4 z-10 ${isRefreshing ? "os-refresh-blink" : ""}`}
          >
            {APP_DEFS.map((app) => {
              const Icon = APP_ICONS[app.id];
              const label = app.desktopLabel ?? app.title;
              return (
                <button
                  key={app.id}
                  onDoubleClick={() => handleIconDoubleClick(app)}
                  onClick={(e) => {
                    // Keyboard-generated clicks carry detail === 0; pointer
                    // single-clicks (detail >= 1) must remain inert on desktop.
                    if (e.nativeEvent.detail === 0) handleIconDoubleClick(app);
                  }}
                  onContextMenu={(e) => openIconContextMenu(app.id, e)}
                  className="flex flex-col items-center gap-1 w-16 p-1.5 rounded-os transition-all hover:scale-110 active:scale-95 focus:outline-none focus:ring-1 focus:ring-os-accent"
                  title={`Open ${label}`}
                >
                  <div className="w-10 h-10 flex items-center justify-center rounded-os glass glass-border transition-all hover:glow-sm">
                    <Icon size={22} className="text-os-accent" />
                  </div>
                  <span className="text-[10px] font-body text-center leading-tight text-os-text">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          {widgets.map((w) => (
            <WidgetWrapper key={w.id} id={w.id}>
              {renderWidgetContent(w.type, w.id)}
            </WidgetWrapper>
          ))}

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
              items={getIconMenuItems(iconContextMenu.id)}
              position={{ x: iconContextMenu.x, y: iconContextMenu.y }}
              onClose={() => setIconContextMenu(null)}
            />
          )}
        </AnimatePresence>

        <Dock />

        <AnimatePresence>{isPaletteOpen && <CommandPalette />}</AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function DesktopIconMobile({
  app,
  onDoubleClick,
  onContextMenu,
}: {
  app: AppDef;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent | React.PointerEvent) => void;
}) {
  const longPress = useLongPress({ onLongPress: onContextMenu });
  const Icon = APP_ICONS[app.id];
  const label = app.desktopLabel ?? app.title;

  return (
    <button
      onClick={() => {
        if (longPress.shouldSuppressClick()) return;
        onDoubleClick();
      }}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onContextMenu={longPress.onContextMenu}
      className="flex flex-col items-center gap-1.5 p-2 rounded-os transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-1 focus:ring-os-accent"
      title={`Open ${label}`}
    >
      <div className="w-12 h-12 flex items-center justify-center rounded-os glass glass-border transition-all hover:glow-sm">
        <Icon size={22} className="text-os-accent" />
      </div>
      <span className="text-[10px] font-body text-center leading-tight text-os-text">{label}</span>
    </button>
  );
}
