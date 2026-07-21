"use client";

import { useState } from "react";
import { Send, CheckCircle, AlertCircle } from "lucide-react";
import { PERSONAL_INFO } from "@/lib/portfolio-data";

interface FormState {
  name: string;
  email: string;
  message: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  message?: string;
}

export function ContactApp() {
  const { contact } = PERSONAL_INFO;

  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    message: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "Invalid email format";
    if (!form.message.trim()) e.message = "Message is required";
    else if (form.message.trim().length < 10)
      e.message = "Message must be at least 10 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    window.open(
      `mailto:${contact.email}?subject=Portfolio Contact from ${encodeURIComponent(form.name)}&body=${encodeURIComponent(form.message + `\n\n— ${form.name} (${form.email})`)}`,
    );
    setSubmitted(true);
  };

  const update = (field: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <CheckCircle size={32} className="text-os-accent" />
        <h2 className="font-display text-sm text-os-accent">Message Sent!</h2>
        <p className="font-body text-xs text-os-muted">
          Your message has been sent via email. I&apos;ll get back to you soon.
        </p>
        <button
          onClick={() => {
            setSubmitted(false);
            setForm({ name: "", email: "", message: "" });
          }}
          className="px-3 py-1.5 text-xs font-body rounded-os transition-opacity hover:opacity-80"
          style={{ background: "var(--accent-1)", color: "var(--bg-primary)" }}
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 font-body text-sm"
    >
      <div>
        <h2 className="font-display text-base text-os-accent">Contact</h2>
        <div className="flex flex-col gap-1 mt-1">
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
      </div>

      <div className="flex flex-col gap-1">
        <label
          className="text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          Name *
        </label>
        <input
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          className="px-3 py-2 rounded-os text-sm font-body outline-none border"
          style={{
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
            borderColor: errors.name ? "#ff4444" : "var(--border)",
          }}
          placeholder="Your name"
        />
        {errors.name && (
          <span
            className="text-[10px] flex items-center gap-1"
            style={{ color: "#ff4444" }}
          >
            <AlertCircle size={10} /> {errors.name}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          className="text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          Email *
        </label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          className="px-3 py-2 rounded-os text-sm font-body outline-none border"
          style={{
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
            borderColor: errors.email ? "#ff4444" : "var(--border)",
          }}
          placeholder="your@email.com"
        />
        {errors.email && (
          <span
            className="text-[10px] flex items-center gap-1"
            style={{ color: "#ff4444" }}
          >
            <AlertCircle size={10} /> {errors.email}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          className="text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          Message *
        </label>
        <textarea
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          rows={4}
          className="px-3 py-2 rounded-os text-sm font-body outline-none border resize-none"
          style={{
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
            borderColor: errors.message ? "#ff4444" : "var(--border)",
          }}
          placeholder="Your message (min 10 characters)"
        />
        {errors.message && (
          <span
            className="text-[10px] flex items-center gap-1"
            style={{ color: "#ff4444" }}
          >
            <AlertCircle size={10} /> {errors.message}
          </span>
        )}
      </div>

      <button
        type="submit"
        className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-display rounded-os transition-opacity hover:opacity-80 self-start"
        style={{ background: "var(--accent-1)", color: "var(--bg-primary)" }}
      >
        <Send size={12} />
        Send Message
      </button>
    </form>
  );
}
