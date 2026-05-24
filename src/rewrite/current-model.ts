import { completeSimple, type Api, type Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { DictateConfig } from "../config";
import { textFromAssistantContent } from "../utils";
import { getRewriteParamsForProvider, type RewriteParams } from "./rewrite-params";

const SYSTEM_PROMPT = `You rewrite speech-to-text transcripts before they are sent to a coding agent.

Rules:
- Correct speech recognition errors, homophones, wrong words, punctuation, and broken sentence boundaries.
- Preserve the user's intent, language, tone, and level of detail.
- Do not answer the request.
- Do not add explanations.
- Do not mention that you corrected text.
- Output only the corrected user message.`;

const resolveRewriteModel = (config: DictateConfig, ctx: ExtensionContext): Model<Api> => {
  const fallback = ctx.model;
  if (!config.rewriteModel) {
    if (!fallback) throw new Error("No rewrite model configured and no active Pi model.");
    return fallback;
  }

  const spec = config.rewriteModel;
  const models = ctx.modelRegistry.getAll();

  // Format: "provider/modelId"
  const slash = spec.indexOf("/");
  if (slash > 0 && slash < spec.length - 1) {
    const provider = spec.slice(0, slash);
    const modelId = spec.slice(slash + 1);
    const found = models.find((m) => m.provider === provider && m.id === modelId);
    if (found) return found;
  }

  // Format: "modelId" (search across all providers)
  const found = models.find((m) => m.id === spec);
  if (found) return found;

  if (!fallback) throw new Error(`Rewrite model "${spec}" not found and no active Pi model fallback.`);
  return fallback;
};

export const rewriteTranscript = async (transcript: string, ctx: ExtensionContext, config: DictateConfig): Promise<string> => {
  const model = resolveRewriteModel(config, ctx);

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) throw new Error(auth.error);

  const rewriteParams: RewriteParams = {
    ...getRewriteParamsForProvider(model.provider),
    ...(config.rewriteTemperature !== undefined ? { temperature: config.rewriteTemperature } : {}),
    ...(config.rewriteReasoning !== undefined ? { reasoning: config.rewriteReasoning as RewriteParams["reasoning"] } : {}),
  };

  const response = await completeSimple(
    model,
    {
      systemPrompt: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Rewrite this transcript. Output only the corrected message.\n\nTranscript:\n${transcript}`,
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: auth.apiKey,
      headers: auth.headers,
      maxTokens: config.rewriteMaxTokens,
      signal: ctx.signal,
      ...rewriteParams,
    },
  );

  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new Error(response.errorMessage || `Dictation rewrite failed: ${response.stopReason}`);
  }

  const text = textFromAssistantContent(response.content);
  if (!text) throw new Error("Dictation rewrite returned empty text.");
  return text;
};
