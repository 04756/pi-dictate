import { readFile } from "node:fs/promises";
import type { DictateConfig } from "../config";
import { formatError, truncate } from "../utils";

export type TranscriptionResult = {
  text: string;
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [250, 750];

const sleep = (ms: number, signal?: AbortSignal): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Dictation transcription was cancelled."));
      return;
    }

    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new Error("Dictation transcription was cancelled."));
      },
      { once: true },
    );
  });
};

const shouldRetryStatus = (status: number): boolean => status === 429 || status >= 500;

const buildFormData = (audio: Buffer, config: DictateConfig): FormData => {
  const form = new FormData();
  form.append("model", config.sttModel);
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "recording.wav");
  if (config.sttLanguage) form.append("language", config.sttLanguage);
  return form;
};

const fetchTranscription = async (audio: Buffer, config: DictateConfig, signal?: AbortSignal): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(config.sttEndpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: buildFormData(audio, config),
        signal,
        redirect: "error",
      });

      if (!shouldRetryStatus(response.status) || attempt === MAX_ATTEMPTS) return response;
      lastError = new Error(`HTTP ${response.status}: ${truncate(await response.text())}`);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("Dictation transcription was cancelled.");
      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;
    }

    await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 1000, signal);
  }

  throw new Error(`Dictation transcription request failed after ${MAX_ATTEMPTS} attempts: ${formatError(lastError)}`);
};

export const transcribe = async (audioPath: string, config: DictateConfig, signal?: AbortSignal): Promise<TranscriptionResult> => {
  const audio = await readFile(audioPath);
  const response = await fetchTranscription(audio, config, signal);

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
