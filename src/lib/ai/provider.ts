/**
 * Provider-agnostic streaming protocol (spec §Internal protocol) — the ONE
 * contract that leaves `src/lib/ai/`. Adapters speak this; the route
 * re-encodes into the existing client SSE shape (`data: {"type":"token"|
 * "error", …}`), so the browser protocol never changes shape.
 *
 * Pure types only — no imports, no side effects; safe on either side of the
 * client/server boundary (server route, adapters, unit tests).
 */

/** Terminal error codes, mapped per adapter from upstream failures. */
export type ProviderErrorCode =
  "rate_limited" | "auth" | "unavailable" | "timeout" | "invalid_response";

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
