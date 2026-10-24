/**
 * Provider registry (design §Internal protocol / §Env contract). The ONLY
 * decision point for which adapter the chat route uses, resolved from env
 * alone: `{ provider }` on success, or a terminal gap kind otherwise.
 *
 * The error union is CLOSED and deliberately frozen in phase-17 task 2 —
 * task 3 (openai-compat) adds only its row to `PROVIDER_ROWS` below, never a
 * new error kind. A known provider name with no row yet resolves to
 * `missing_model` in the interim.
 */
import type { ModelProvider, ProviderName } from "./provider";
import { ANTHROPIC_ADAPTER } from "./adapters/anthropic";
import { OPENAI_COMPAT_ADAPTER } from "./adapters/openai-compat";

export interface ProviderEnv {
  AI_PROVIDER?: string;
  ANTHROPIC_API_KEY?: string;
  AI_API_KEY?: string;
  /** openai-compat: the `…/v1` root and the model id (both REQUIRED). */
  AI_BASE_URL?: string;
  AI_MODEL?: string;
}

/** Terminal pre-stream gap kinds (design §Route rewrite). */
export type ProviderResolutionError = "not_configured" | "invalid_provider" | "missing_model";

export type ProviderResolution =
  | { provider: ModelProvider }
  | { error: ProviderResolutionError };

/** The v1 provider set — closed, so a new adapter is a compile decision. */
const PROVIDER_NAMES: readonly ProviderName[] = ["anthropic", "openai-compat"];

function isProviderName(value: string): value is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(value);
}

function isAnthropicConfigured(env: ProviderEnv): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.AI_API_KEY);
}

/**
 * Per-provider availability check. `openai-compat` lands with task 3: its row
 * returns its adapter when wired, or `{ error: "missing_model" }` when
 * `AI_MODEL` is absent (keyless operation is allowed there, a key is not
 * required).
 */
type ProviderRow = (env: ProviderEnv) => ProviderResolution;

const PROVIDER_ROWS: Partial<Record<ProviderName, ProviderRow>> = {
  anthropic: (env) =>
    isAnthropicConfigured(env) ? { provider: ANTHROPIC_ADAPTER } : { error: "not_configured" },
  "openai-compat": (env) => {
    const baseUrl = env.AI_BASE_URL?.trim();
    const model = env.AI_MODEL?.trim();
    if (!baseUrl || !model) return { error: "missing_model" };
    return { provider: OPENAI_COMPAT_ADAPTER };
  },
};

export function resolveProviderFromEnv(env: ProviderEnv): ProviderResolution {
  // An empty/whitespace value counts as unset (never a bogus provider name).
  const requested = env.AI_PROVIDER?.trim();
  const name = requested ? requested : "anthropic";
  if (!isProviderName(name)) return { error: "invalid_provider" };
  const row = PROVIDER_ROWS[name];
  if (row) return row(env);
  return { error: "missing_model" };
}
