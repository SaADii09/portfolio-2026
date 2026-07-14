"use client";

const PROJECTS = [
  {
    title: "DevOS Portfolio",
    desc: "Interactive Web OS portfolio with window management, themes, widgets, and AI chat assistant.",
    tech: ["Next.js", "TypeScript", "Framer Motion", "Zustand"],
  },
  {
    title: "AI Job Portal",
    desc: "Full-stack AI-powered job platform with resume analyzer, chatbot, and career intelligence.",
    tech: ["Next.js", "Node.js", "PostgreSQL", "LangChain", "OpenAI"],
  },
  {
    title: "SaaS CRM Platform",
    desc: "Scalable CRM with AI features, real-time video/audio chat, and automated workflows.",
    tech: ["Next.js", "Convex", "WebRTC", "Redis", "MongoDB"],
  },
  {
    title: "API Automation Toolkit",
    desc: "Workflow automation platform with n8n integration and multi-step pipeline builder.",
    tech: ["Node.js", "n8n", "Redis", "PostgreSQL"],
  },
];

export function ProjectsApp() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-base text-os-accent">Projects</h2>

      <div className="flex flex-col gap-3">
        {PROJECTS.map((p, i) => (
          <div
            key={i}
            className="p-3 rounded-os bg-os-surface-alt"
          >
            <h3 className="font-display text-xs mb-1 text-os-accent">
              {p.title}
            </h3>
            <p className="font-body text-sm leading-relaxed mb-2 text-os-text">
              {p.desc}
            </p>
            <div className="flex flex-wrap gap-1">
              {p.tech.map((t) => (
                <span
                  key={t}
                  className="px-1.5 py-0.5 text-[10px] rounded-os bg-os-bg text-os-muted"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
