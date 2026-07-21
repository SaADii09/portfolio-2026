"use client";

import { FileText } from "lucide-react";
import { PERSONAL_INFO, TOP_SKILLS } from "@/lib/portfolio-data";

export function AboutApp() {
  const { summary, contact } = PERSONAL_INFO;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-base text-os-accent">About Me</h2>

      <div className="flex flex-col gap-3 font-body text-sm leading-relaxed text-os-text">
        {summary.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}

        <div className="mt-2">
          <h3 className="font-display text-xs mb-2 text-os-accent">
            Core Skills
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {TOP_SKILLS.map((skill) => (
              <span
                key={skill}
                className="px-2 py-0.5 text-xs rounded-os glass glass-pos glass-border text-os-text transition-all hover:glow-sm hover:scale-105"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-1.5">
          <a
            href={`mailto:${contact.email}`}
            className="text-xs text-os-muted hover:text-os-accent transition-colors"
          >
            {contact.email}
          </a>
          <a
            href={contact.links.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-os-muted hover:text-os-accent transition-colors"
          >
            LinkedIn
          </a>
          <a
            href={contact.links.github}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-os-muted hover:text-os-accent transition-colors"
          >
            GitHub
          </a>
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
