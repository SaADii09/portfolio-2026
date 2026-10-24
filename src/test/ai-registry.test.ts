import { describe, it, expect } from "vitest";
import { ANTHROPIC_ADAPTER } from "@/lib/ai/adapters/anthropic";
import { resolveProviderFromEnv } from "@/lib/ai/registry";

describe("resolveProviderFromEnv", () => {
  it("resolves the legacy ANTHROPIC_API_KEY-only env to the anthropic provider", () => {
    const resolved = resolveProviderFromEnv({ ANTHROPIC_API_KEY: "sk-test" });
    expect("provider" in resolved).toBe(true);
    if (!("provider" in resolved)) return;
    expect(resolved.provider).toBe(ANTHROPIC_ADAPTER);
  });

  it("resolves an empty env to not_configured (the legacy unconfigured copy case)", () => {
    expect(resolveProviderFromEnv({})).toEqual({ error: "not_configured" });
    expect(resolveProviderFromEnv({ ANTHROPIC_API_KEY: "" })).toEqual({ error: "not_configured" });
    expect(resolveProviderFromEnv({ AI_API_KEY: "" })).toEqual({ error: "not_configured" });
  });

  it("maps an unknown AI_PROVIDER to invalid_provider — a distinct error, never folded", () => {
    expect(resolveProviderFromEnv({ AI_PROVIDER: "bogus", ANTHROPIC_API_KEY: "k" })).toEqual({
      error: "invalid_provider",
    });
    expect(resolveProviderFromEnv({ AI_PROVIDER: "groq" })).toEqual({
      error: "invalid_provider",
    });
  });

  it("accepts the generic AI_API_KEY when AI_PROVIDER=anthropic", () => {
    const resolved = resolveProviderFromEnv({ AI_PROVIDER: "anthropic", AI_API_KEY: "generic" });
    expect(resolved).toEqual({ provider: ANTHROPIC_ADAPTER });
  });

  it("resolves the anthropic adapter with its pinned capabilities", () => {
    const resolved = resolveProviderFromEnv({ ANTHROPIC_API_KEY: "sk-test" });
    if (!("provider" in resolved)) return;
    expect(resolved.provider.capabilities).toEqual({
      name: "anthropic",
      supportsCaching: true,
      contextCharacterBudget: 120_000,
      defaultTemperature: 0.3,
    });
  });

  it("reports a known-but-not-yet-wired provider as missing_model (union frozen now; the openai-compat row lands with task 3)", () => {
    expect(resolveProviderFromEnv({ AI_PROVIDER: "openai-compat" })).toEqual({
      error: "missing_model",
    });
    expect(resolveProviderFromEnv({ AI_PROVIDER: "anthropic" })).toEqual({
      error: "not_configured",
    });
  });
});
