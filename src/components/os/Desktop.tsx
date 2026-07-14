"use client";

import { AnimatePresence } from "framer-motion";
import { useStore } from "@/store";
import { Window } from "@/components/os/Window";
import { Taskbar } from "@/components/os/Taskbar";
import { AboutApp } from "@/components/apps/AboutApp";
import { ProjectsApp } from "@/components/apps/ProjectsApp";
import { User, FolderKanban, FileText, Terminal, Mail } from "lucide-react";

const DESKTOP_ICONS = [
  { id: "about", label: "About Me", icon: User, component: "about" },
  { id: "projects", label: "Projects", icon: FolderKanban, component: "projects" },
  { id: "resume", label: "Resume", icon: FileText, component: "resume" },
  { id: "terminal", label: "Terminal", icon: Terminal, component: "terminal" },
  { id: "contact", label: "Contact", icon: Mail, component: "contact" },
];

function renderAppContent(component?: string) {
  switch (component) {
    case "about":
      return <AboutApp />;
    case "projects":
      return <ProjectsApp />;
    default:
      return (
        <div className="flex items-center justify-center h-full opacity-50 font-body text-os-muted">
          {component
            ? `${component} — coming soon`
            : "Select an app from the Start menu"}
        </div>
      );
  }
}

export function Desktop() {
  const windows = useStore((s) => s.windows);
  const openWindow = useStore((s) => s.openWindow);

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

  return (
    <div className="relative w-full h-screen overflow-hidden flex flex-col bg-os-bg">
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

        <AnimatePresence>
          {windows
            .filter((w) => !w.isMinimized)
            .map((w) => (
              <Window key={w.id} id={w.id}>
                {renderAppContent(w.component)}
              </Window>
            ))}
        </AnimatePresence>
      </div>

      <Taskbar />
    </div>
  );
}
