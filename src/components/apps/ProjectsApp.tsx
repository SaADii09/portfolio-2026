"use client";

import { useStore } from "@/store";

const PROJECTS = [
  {
    title: "DevOS Portfolio",
    desc: "Interactive Web OS portfolio with window management, themes, widgets, and AI chat assistant.",
    tech: ["Next.js", "TypeScript", "Framer Motion", "Zustand"],
    url: "https://github.com/SaADii09",
  },
  {
    title: "AI Job Portal",
    desc: "Full-stack AI-powered job platform with resume analyzer, chatbot, and career intelligence.",
    tech: ["Next.js", "Node.js", "PostgreSQL", "LangChain", "OpenAI"],
    url: "https://github.com/SaADii09",
  },
  {
    title: "SaaS CRM Platform",
    desc: "Scalable CRM with AI features, real-time video/audio chat, and automated workflows.",
    tech: ["Next.js", "Convex", "WebRTC", "Redis", "MongoDB"],
    url: "https://github.com/SaADii09",
  },
  {
    title: "API Automation Toolkit",
    desc: "Workflow automation platform with n8n integration and multi-step pipeline builder.",
    tech: ["Node.js", "n8n", "Redis", "PostgreSQL"],
    url: "https://github.com/SaADii09",
  },
];

export function ProjectsApp() {
  const openWindow = useStore((s) => s.openWindow);
  const windows = useStore((s) => s.windows);

  const handleProjectClick = (p: (typeof PROJECTS)[number]) => {
    const existing = windows.find((w) => w.type === "iframe" && w.url === p.url);
    if (existing) {
      if (existing.isMinimized) useStore.getState().restoreWindow(existing.id);
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
            className="group p-3 rounded-os glass glass-border text-left transition-all hover:-translate-y-0.5 hover:glow-sm cursor-pointer"
          >
            <h3 className="font-display text-xs mb-1 text-os-accent group-hover:glow-accent">{p.title}</h3>
            <p className="font-body text-sm leading-relaxed mb-2 text-os-text">{p.desc}</p>
            <div className="flex flex-wrap gap-1">
              {p.tech.map((t) => (
                <span
                  key={t}
                  className="px-1.5 py-0.5 text-[10px] rounded-os glass text-os-muted"
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
