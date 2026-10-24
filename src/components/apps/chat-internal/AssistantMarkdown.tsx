"use client";

import type { ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { extractChatActions } from "@/lib/ai/actions";
import { isAllowedChatLink } from "@/lib/chat-links";

/**
 * Markdown renderer for assistant answers (design §Markdown).
 *
 * Owns two responsibilities the transcript must never leak:
 *  1. ACTION-MARKER STRIPPING — `extractChatActions(content).text` removes the
 *     `[[action:…]]` protocol text before it can reach a bubble.
 *  2. LINK ALLOW-LIST — an anchor renders only when its href is in the closed
 *     `chat-links.ts` table; anything else (hallucinated/injected host) keeps
 *     its label as plain text. `react-markdown` escapes raw HTML by default,
 *     so no `rehype-raw` is ever added.
 */
function AllowedAnchor({ href, children }: { href?: string; children?: ReactNode }) {
  if (!href || !isAllowedChatLink(href)) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="md-os-link">
      {children}
    </a>
  );
}

export function AssistantMarkdown({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="md-os">
      <Markdown remarkPlugins={[remarkGfm]} components={{ a: AllowedAnchor }}>
        {extractChatActions(content).text}
      </Markdown>
      {streaming && <span className="md-os-cursor" aria-hidden="true" />}
    </div>
  );
}
