import { completeSimple } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { DictateConfig } from "../config";
import { textFromAssistantContent } from "../utils";

const SYSTEM_PROMPT = `You rewrite speech-to-text transcripts before they are sent to a coding agent.

Rules:
- Correct speech recognition errors, homophones, wrong words, punctuation, and broken sentence boundaries.
- Preserve the user's intent, language, tone, and level of detail.
- Do not answer the request.
- Do not add explanations.
- Do not mention that you corrected text.
- Output only the corrected user message.`;

export const rewriteTranscript = async (transcript: string, ctx: ExtensionContext, config: DictateConfig): Promise<string> => {
  const model = ctx.model;
  if (!model) throw new Error("No active Pi model is selected for dictation rewrite.");

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) throw new Error(auth.error);

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
    },
  );

  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new Error(response.errorMessage || `Dictation rewrite failed: ${response.stopReason}`);
  }

  const text = textFromAssistantContent(response.content);
  if (!text) throw new Error("Dictation rewrite returned empty text.");
  return text;
};
