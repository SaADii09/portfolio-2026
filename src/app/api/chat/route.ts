import { retrieveRelevantContext } from "@/lib/rag";

const MAX_REQUESTS_PER_MINUTE = 15;
const RATE_LIMIT_WINDOW_MS = 60_000;

const ALLOWED_ROLES = new Set<string>(["user", "assistant"]);
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 10_000;

const requestLog = new Map<string, number[]>();

export function pruneTimestamps(stamps: number[], now: number): number[] {
  return stamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const pruned = pruneTimestamps(requestLog.get(ip) ?? [], now);
  if (pruned.length === 0) {
    requestLog.delete(ip);
  }
  if (pruned.length >= MAX_REQUESTS_PER_MINUTE) {
    return true;
  }
  requestLog.set(ip, [...pruned, now]);
  return false;
}

const SYSTEM_PROMPT_BASE = `You are DevOS AI, an assistant embedded in Saad Ahmad's interactive portfolio website.
You help visitors learn about Saad's work, skills, projects, and experience.
Be concise, friendly, and helpful. Use markdown sparingly (bold for emphasis).
If asked something outside your knowledge, say you don't know rather than making up an answer.
The current year is 2026.

Below is relevant context from Saad's portfolio knowledge base. Use it to answer the user's question.
If the context doesn't contain enough information, answer based on what you know about Saad from the context.
`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isChatMessage(message: unknown): message is ChatMessage {
  if (typeof message !== "object" || message === null) return false;
  const role = (message as { role?: unknown }).role;
  const content = (message as { content?: unknown }).content;
  if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) return false;
  if (!isNonEmptyString(content)) return false;
  return content.length <= MAX_MESSAGE_LENGTH;
}

type ValidationOk = { ok: true; messages: ChatMessage[] };
type ValidationFail = { ok: false; reason: string };

export function validateMessages(input: unknown): ValidationOk | ValidationFail {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, reason: "messages array is required" };
  }
  if (input.length > MAX_MESSAGES) {
    return { ok: false, reason: "messages must contain at most 20 entries" };
  }
  if (!input.every(isChatMessage)) {
    return {
      ok: false,
      reason:
        "each message must have role 'user' or 'assistant' and string content of at most 10000 characters",
    };
  }
  const messages = input.map((message) => {
    const { role, content } = message as ChatMessage;
    return { role, content } as ChatMessage;
  });
  return { ok: true, messages };
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1";

  if (isRateLimited(ip)) {
    return Response.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = validateMessages((body as { messages?: unknown } | null)?.messages);
  if (!validated.ok) {
    return Response.json({ error: validated.reason }, { status: 400 });
  }
  const messages = validated.messages;

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const context = lastUserMessage ? retrieveRelevantContext(lastUserMessage.content) : "";

  const systemPrompt = SYSTEM_PROMPT_BASE + (context ? `\n\nRelevant context:\n${context}` : "");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Anthropic API error:", response.status, errBody);
      return Response.json({ error: "AI service unavailable" }, { status: 502 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;
              const data = trimmed.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                  const payload = JSON.stringify({
                    type: "token",
                    text: parsed.delta.text,
                  });
                  controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
                }
              } catch {
                // skip malformed SSE lines
              }
            }
          }
        } catch (err) {
          console.error("Stream error:", err);
          // One-shot terminal error event so the client can render the
          // interruption. Must land before controller.close() in finally.
          // enqueue can throw if the client aborted mid-stream — swallow, the response is dead either way.
          // enqueue can throw if the client aborted mid-stream — swallow, the response is dead either way.
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  text: "The assistant was interrupted. Please try again.",
                })}\n\n`,
              ),
            );
          } catch {
            // stream already closed or cancelled — nothing left to deliver
          }
        } finally {
          try {
            controller.close();
          } catch {
            // stream already closed or cancelled — nothing left to close
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
