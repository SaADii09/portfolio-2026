"use client";

import { FileText } from "lucide-react";

export function AboutApp() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-base text-os-accent">About Me</h2>

      <div className="flex flex-col gap-3 font-body text-sm leading-relaxed text-os-text">
        <p>
          Full-stack software engineer with 2.5+ years of professional experience building
          production-grade web applications and AI-powered systems.
        </p>
        <p>
          Specialized in the JavaScript/TypeScript ecosystem (Next.js, Node.js) with hands-on
          expertise in AI engineering, RAG pipelines, LangChain/LangGraph agents, and OpenAI API
          integrations.
        </p>
        <p>
          Proven record of delivering end-to-end SaaS and AI-driven products, from system
          architecture to production deployment, across CRM, job portal, and real-time communication
          platforms.
        </p>

        <div className="mt-2">
          <h3 className="font-display text-xs mb-2 text-os-accent">Core Skills</h3>
          <div className="flex flex-wrap gap-1.5">
            {[
              "Next.js",
              "React",
              "TypeScript",
              "Node.js",
              "PostgreSQL",
              "LangChain",
              "RAG",
              "Docker",
            ].map((skill) => (
              <span
                key={skill}
                className="px-2 py-0.5 text-xs rounded-os bg-os-surface-alt text-os-text"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-2">
          <a
            href="/resume.pdf"
            className="inline-flex items-center gap-2 text-sm font-body text-os-accent hover:underline"
          >
            <FileText size={14} />
            Download Resume (PDF)
          </a>
        </div>
      </div>
    </div>
  );
}
