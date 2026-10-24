import { PERSONAL_INFO, PROJECTS } from "@/lib/portfolio-data";

/**
 * Closed chat link table (design §Link allow-list). The model may only emit
 * these exact URLs; every other href renders as plain text, so an answer can
 * never send a visitor to a hallucinated (or injected) destination.
 *
 * Derived from the same `portfolio-data.ts` the Contact/Projects apps read,
 * so the table cannot drift from what the site actually links to.
 */
export const CHAT_LINKS = {
  email: `mailto:${PERSONAL_INFO.contact.email}`,
  github: PERSONAL_INFO.contact.links.github,
  linkedin: PERSONAL_INFO.contact.links.linkedin,
} as const;

/** Every project repo (and demo, when deployed) URL — the KB's project links. */
export const CHAT_PROJECT_LINKS: readonly string[] = PROJECTS.flatMap((project) =>
  project.demoUrl ? [project.repoUrl, project.demoUrl] : [project.repoUrl],
);

/**
 * Normalized form used for allow-list comparison:
 *  - `mailto:` compares lowercased, whole;
 *  - http(s) compares lowercased host, path case-preserved, trailing slashes
 *    stripped (a model copying the KB may add one);
 *  - every other scheme (javascript:, data:, …) is rejected outright.
 */
export function normalizeChatUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith("mailto:")) return trimmed.toLowerCase();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${host}${path}${parsed.search}`;
  } catch {
    return null;
  }
}

const ALLOWED_URLS: ReadonlySet<string> = new Set(
  [CHAT_LINKS.email, CHAT_LINKS.github, CHAT_LINKS.linkedin, ...CHAT_PROJECT_LINKS]
    .map(normalizeChatUrl)
    .filter((url): url is string => url !== null),
);

/** True only for the closed table above (Review Focus #4). */
export function isAllowedChatLink(url: string): boolean {
  const normalized = normalizeChatUrl(url);
  return normalized !== null && ALLOWED_URLS.has(normalized);
}
