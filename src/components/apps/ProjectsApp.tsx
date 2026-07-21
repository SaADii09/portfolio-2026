"use client";

import { useStore } from "@/store";
import { PROJECTS } from "@/lib/portfolio-data";

export function ProjectsApp() {
  const openWindow = useStore((s) => s.openWindow);
  const windows = useStore((s) => s.windows);

  const handleProjectClick = (p: (typeof PROJECTS)[number]) => {
    const existing = windows.find(
      (w) => w.type === "iframe" && w.url === p.url,
    );
    if (existing) {
      if (existing.isMinimized)
        useStore.getState().restoreWindow(existing.id);
      useStore.getState().focusWindow(existing.id);
      return;
    }
    openWindow({
      title: p.title,
      type: "iframe",
      url: p.url,
      width: 520,
      height: 400,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-base text-os-accent">Projects</h2>

      <div className="flex flex-col gap-3">
        {PROJECTS.map((p, i) => (
          <button
            key={i}
            onClick={() => handleProjectClick(p)}
            className="group p-3 rounded-os glass glass-pos glass-border text-left transition-all hover:-translate-y-0.5 hover:glow-sm cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display text-xs text-os-accent group-hover:glow-accent">
                {p.title}
              </h3>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-os glass glass-pos"
                style={{ color: "var(--text-secondary)" }}
              >
                {p.category}
              </span>
            </div>
            <p className="font-body text-sm leading-relaxed mb-2 text-os-text">
              {p.description}
            </p>
            <div className="flex flex-wrap gap-1">
              {p.tech.map((t) => (
                <span
                  key={t}
                  className="px-1.5 py-0.5 text-[10px] rounded-os glass glass-pos text-os-muted"
                >
                  {t}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
