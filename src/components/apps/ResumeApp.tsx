"use client";

import { EXPERIENCE, SKILLS, EDUCATION, CERTIFICATIONS } from "@/lib/portfolio-data";

export function ResumeApp() {
  return (
    <div className="flex flex-col gap-5 font-body text-sm">
      {/* Experience */}
      <div>
        <h3 className="font-display text-xs mb-2.5 text-os-accent">
          Experience
        </h3>
        <div className="flex flex-col gap-3">
          {EXPERIENCE.map((exp, i) => (
            <div
              key={i}
              className="relative p-3 rounded-os glass-light border"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--accent-1) 10%, transparent)",
              }}
            >
              <div
                className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full"
                style={{ background: "var(--accent-1)" }}
              />
              <div className="flex items-start justify-between gap-2 mb-1.5 pl-2">
                <div>
                  <p className="font-display text-[11px]">{exp.role}</p>
                  <p
                    className="text-[10px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {exp.company} — {exp.location}
                  </p>
                  <p
                    className="text-[9px] mt-0.5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {exp.type} · {exp.mode}
                    {exp.note ? ` · ${exp.note}` : ""}
                  </p>
                </div>
                <span
                  className="text-[9px] whitespace-nowrap px-1.5 py-0.5 rounded-os glass glass-pos"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {exp.period}
                </span>
              </div>
              <ul
                className="list-disc list-inside text-xs leading-relaxed space-y-0.5 pl-2"
                style={{ color: "var(--text-primary)" }}
              >
                {exp.highlights.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
              {exp.skills.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2 pl-2">
                  {exp.skills.map((s) => (
                    <span
                      key={s}
                      className="px-1.5 py-0.5 text-[9px] rounded-os glass glass-pos text-os-muted"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
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
                    className="px-1.5 py-0.5 text-[10px] rounded-os glass glass-pos glass-border transition-all hover:glow-sm"
                    style={{ color: "var(--text-primary)" }}
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
        <h3 className="font-display text-xs mb-1.5 text-os-accent">
          Education
        </h3>
        {EDUCATION.map((edu, i) => (
          <p key={i} className="text-xs">
            {edu.degree} in {edu.field} —{" "}
            <span style={{ color: "var(--text-secondary)" }}>
              {edu.institution} ({edu.graduationDate})
            </span>
          </p>
        ))}
      </div>

      {/* Certifications */}
      {CERTIFICATIONS.length > 0 && (
        <div>
          <h3 className="font-display text-xs mb-1.5 text-os-accent">
            Certifications
          </h3>
          {CERTIFICATIONS.map((cert, i) => (
            <p key={i} className="text-xs">
              {cert.name} —{" "}
              <span style={{ color: "var(--text-secondary)" }}>
                {cert.issuer} ({cert.date})
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
