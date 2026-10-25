/**
 * Provider-agnostic streaming protocol (spec §Internal protocol) — the ONE
 * contract that leaves `src/lib/ai/`. Adapters speak this; the route
 * re-encodes into the existing client SSE shape (`data: {"type":"token"|
 * "error", …}`), so the browser protocol never changes shape.
 *
 * Pure types plus the one shared 429 copy constant — no imports, no side
 * effects; safe on either side of the client/server boundary (server route,
 * adapters, client slice, unit tests).
 */

/** Terminal error codes, mapped per adapter from upstream failures. */
export type ProviderErrorCode =
  "rate_limited" | "auth" | "unavailable" | "timeout" | "invalid_response";

/**
 * The client-visible copy for a provider-side rate limit (upstream 429 →
 * `rate_limited`). Single truth for the route's 429 body and the slice's
 * prefix-free rendering; tests pin this export, never a second literal.
 */
export const FRIENDLY_429_COPY =
  "The assistant is getting a lot of questions — give it a few seconds.";

/**
 * One stream event. An `error` event is TERMINAL and may arrive mid-stream;
 * EOF (end of the iterable) ends the stream — there is no explicit done
 * event (matches today's client expectations).
 */
export type NormalizedStreamEvent =
  { type: "token"; text: string } | { type: "error"; code: ProviderErrorCode; text: string };

/** The v1 provider set — closed, so a new adapter is a compile decision. */
export type ProviderName = "anthropic" | "openai-compat";

/**
 * What a prompt builder / route may assume about an adapter. Consulted
 * instead of hardcoding: history is trimmed to `contextCharacterBudget`,
 * caching attaches only when `supportsCaching` is true.
 */
export interface ProviderCapabilities {
  name: ProviderName;
  supportsCaching: boolean;
  /** Budget for system prompt + history in CHARACTERS (8k tokens ≈ 32k chars). */
  contextCharacterBudget: number;
  defaultTemperature: number;
}

export interface StreamRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  system: string;
  maxTokens: number;
  temperature: number;
  signal: AbortSignal;
}

/** An adapter: streams normalized events and declares its capabilities. */
export interface ModelProvider {
  stream(req: StreamRequest): AsyncIterable<NormalizedStreamEvent>;
  capabilities: ProviderCapabilities;
}
