import { readFile } from "node:fs/promises";
import type { DictateConfig } from "../config";
import { formatError, truncate } from "../utils";

export type TranscriptionResult = {
  text: string;
};

export const transcribe = async (audioPath: string, config: DictateConfig, signal?: AbortSignal): Promise<TranscriptionResult> => {
  const audio = await readFile(audioPath);
  const form = new FormData();
  form.append("model", config.sttModel);
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "recording.wav");
  if (config.sttLanguage) form.append("language", config.sttLanguage);

  const response = await fetch(config.sttEndpoint, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
    signal,
    redirect: "error",
  }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("Dictation transcription was cancelled.");
    throw error;
  });

  if (!response.ok) {
    throw new Error(`Dictation transcription failed (${response.status}): ${truncate(await response.text())}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Dictation transcription returned invalid JSON: ${formatError(error)}`);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Dictation transcription returned an invalid payload.");
  }

  const text = (payload as Record<string, unknown>).text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Dictation transcription response did not include text.");
  }

  return { text: text.trim() };
};
