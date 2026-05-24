/**
 * Per-provider rewrite parameter profiles.
 *
 * Controls what parameters are passed to completeSimple for the rewrite step.
 * Different providers support different options:
 *   - Most: temperature, maxTokens
 *   - Anthropic/DeepSeek: reasoning (low/medium/high)
 *   - Codex: no temperature, no reasoning
 */
import type { ThinkingLevel } from "@earendil-works/pi-ai";

export type RewriteParams = {
  temperature?: number;
  reasoning?: ThinkingLevel;
};

const PROVIDER_PARAMS: Record<string, RewriteParams> = {
  "openai-codex": {},

  anthropic: { temperature: 0, reasoning: "low" },
  deepseek: { temperature: 0, reasoning: "low" },
};

const DEFAULT_PARAMS: RewriteParams = { temperature: 0 };

export const getRewriteParamsForProvider = (provider: string): RewriteParams => {
  return PROVIDER_PARAMS[provider] ?? DEFAULT_PARAMS;
};


