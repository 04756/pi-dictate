import type { DictateConfig } from "./config";
import { formatError, truncate } from "./utils";

export type DoctorResult = {
  ok: boolean;
  message: string;
};

const withTimeout = (ms: number): AbortSignal => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms).unref();
  return controller.signal;
};

const endpointRoot = (endpoint: string): string => {
  const url = new URL(endpoint);
  return `${url.protocol}//${url.host}/`;
};

export const runDoctor = async (config: DictateConfig): Promise<DoctorResult[]> => {
  const results: DoctorResult[] = [];

  if (process.platform !== "darwin") {
    results.push({ ok: false, message: "platform: pi-dictate v1 supports macOS only" });
  } else {
    results.push({ ok: true, message: "platform: macOS" });
  }

  results.push({ ok: true, message: `endpoint: ${config.sttEndpoint}` });
  results.push({ ok: true, message: `language: ${config.sttLanguage || "not set"}` });
  results.push({ ok: true, message: `audio: ${config.inputFormat} ${config.input}, ${config.sampleRate} Hz, ${config.channels} channel(s)` });

  try {
    const startedAt = Date.now();
    const response = await fetch(endpointRoot(config.sttEndpoint), { signal: withTimeout(3000) });
    const elapsed = Date.now() - startedAt;
    if (response.ok) {
      results.push({ ok: true, message: `whisper-server reachable: ${response.status} in ${(elapsed / 1000).toFixed(2)}s` });
    } else {
      results.push({ ok: false, message: `whisper-server root returned HTTP ${response.status}: ${truncate(await response.text(), 300)}` });
    }
  } catch (error) {
    results.push({ ok: false, message: `whisper-server unreachable: ${formatError(error)}` });
  }

  return results;
};

export const formatDoctorResults = (results: DoctorResult[]): string => {
  return results.map((result) => `${result.ok ? "OK" : "FAIL"} ${result.message}`).join("\n");
};
