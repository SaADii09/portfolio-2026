"use client";

const EXPERIENCE = [
  {
    role: "AI Full Stack Developer",
    company: "NS Developer — Vehari, Pakistan",
    period: "Apr 2026 – Present",
    items: [
      "Architected full-stack AI-powered job portal (Next.js, Node.js, PostgreSQL, Strapi)",
      "Built AI Resume Analyzer with RAG pipelines and OpenAI APIs",
      "Developed AI Chatbot with Resume Builder via natural language",
      "Engineered Career Intelligence module with smart job filtering",
      "Integrated Stripe payment gateway with tiered subscriptions",
    ],
  },
  {
    role: "Full Stack Developer",
    company: "AccellionX — Lahore, Pakistan",
    period: "Nov 2025 – May 2026",
    items: [
      "Led full-stack SaaS CRM development (Next.js, TypeScript, Convex, PostgreSQL, Redis, MongoDB)",
      "Built AI-powered features with LangChain, LangGraph, and OpenAI",
      "Architected real-time video/audio/chat with WebSockets and WebRTC",
      "Implemented RBAC with Clerk and JWT",
    ],
  },
  {
    role: "Full Stack Developer",
    company: "SpiralSols — Multan, Pakistan",
    period: "May 2025 – Nov 2025",
    items: [
      "Developed scalable full-stack apps (Next.js, TypeScript, Convex, PostgreSQL, Redis)",
      "Designed Stripe subscription system with tiered pricing",
      "Built real-time features with WebSockets, WebRTC, and Twilio",
    ],
  },
  {
    role: "Associate Software Engineer",
    company: "TechSol Hub — Vehari, Pakistan",
    period: "Nov 2024 – May 2025",
    items: [
      "Built full-stack MERN applications with JWT auth and RBAC",
      "Managed state with Redux Toolkit and TanStack Query",
      "Built drag-and-drop interfaces and rich-text editors",
    ],
  },
];

const SKILLS = [
  { category: "Languages", items: ["JavaScript", "TypeScript", "Python", "C#", "SQL"] },
  {
    category: "Frontend",
    items: ["Next.js", "React", "React Native", "Expo", "Tailwind CSS", "Redux", "TanStack Query"],
  },
  { category: "Backend", items: ["Node.js", "Express", "NestJS", "FastAPI", "Convex", "Strapi"] },
  {
    category: "AI & Agents",
    items: ["LangChain", "LangGraph", "RAG", "OpenAI", "Prompt Engineering", "Multi-Agent Systems"],
  },
  {
    category: "Databases",
    items: ["PostgreSQL", "MongoDB", "Redis", "Firebase", "Supabase", "Pinecone"],
  },
  { category: "DevOps", items: ["AWS EC2", "Docker", "Nginx", "GitHub Actions", "Vercel"] },
];

export function ResumeApp() {
  return (
    <div className="flex flex-col gap-5 font-body text-sm">
      <div>
        <h2 className="font-display text-base text-os-accent">Saad Ahmad</h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Software Engineer (Full-Stack + AI)
        </p>
      </div>

      {/* Experience */}
      <div>
        <h3 className="font-display text-xs mb-2.5 text-os-accent">Experience</h3>
        <div className="flex flex-col gap-3">
          {EXPERIENCE.map((exp, i) => (
            <div key={i} className="p-3 rounded-os" style={{ background: "var(--bg-tertiary)" }}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div>
                  <p className="font-display text-[11px]">{exp.role}</p>
                  <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                    {exp.company}
                  </p>
                </div>
                <span
                  className="text-[9px] whitespace-nowrap px-1.5 py-0.5 rounded-os"
                  style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}
                >
                  {exp.period}
                </span>
              </div>
              <ul
                className="list-disc list-inside text-xs leading-relaxed space-y-0.5"
                style={{ color: "var(--text-primary)" }}
              >
                {exp.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Skills */}
      <div>
        <h3 className="font-display text-xs mb-2.5 text-os-accent">Skills</h3>
        <div className="flex flex-col gap-2">
          {SKILLS.map((group) => (
            <div key={group.category} className="flex items-start gap-2">
              <span
                className="text-[10px] font-display whitespace-nowrap w-16 pt-0.5"
                style={{ color: "var(--text-secondary)" }}
              >
                {group.category}
              </span>
              <div className="flex flex-wrap gap-1">
                {group.items.map((s) => (
                  <span
                    key={s}
                    className="px-1.5 py-0.5 text-[10px] rounded-os"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Education */}
      <div>
        <h3 className="font-display text-xs mb-1.5 text-os-accent">Education</h3>
        <p className="text-xs">
          BS Computer Science —{" "}
          <span style={{ color: "var(--text-secondary)" }}>
            COMSATS University Islamabad, Vehari Campus (2024)
          </span>
        </p>
      </div>
    </div>
  );
}
