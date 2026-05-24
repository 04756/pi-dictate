import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type DictateConfig = {
  keybind: string;
  sttEndpoint: string;
  sttModel: string;
  sttLanguage: string;
  ffmpegPath: string;
  inputFormat: string;
  input: string;
  sampleRate: number;
  channels: number;
  maxSeconds: number;
  minBytes: number;
  rewriteMaxTokens: number;
};

export const CONFIG_PATH = join(homedir(), ".pi-dictate", "config.json");

type ConfigFile = {
  keybind?: string;
  stt?: {
    endpoint?: string;
    model?: string;
    language?: string;
  };
  audio?: {
    ffmpegPath?: string;
    inputFormat?: string;
    input?: string;
    sampleRate?: number;
    channels?: number;
    maxSeconds?: number;
    minBytes?: number;
  };
  rewrite?: {
    maxTokens?: number;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
};

const optionalString = (value: unknown): string | undefined => {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const optionalPositiveInteger = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return undefined;
  return value;
};

const parseConfigFile = (value: unknown): ConfigFile => {
  if (!isRecord(value)) return {};
  const stt = isRecord(value.stt) ? value.stt : {};
  const audio = isRecord(value.audio) ? value.audio : {};
  const rewrite = isRecord(value.rewrite) ? value.rewrite : {};

  return {
    keybind: optionalString(value.keybind),
    stt: {
      endpoint: optionalString(stt.endpoint),
      model: optionalString(stt.model),
      language: optionalString(stt.language),
    },
    audio: {
      ffmpegPath: optionalString(audio.ffmpegPath),
      inputFormat: optionalString(audio.inputFormat),
      input: optionalString(audio.input),
      sampleRate: optionalPositiveInteger(audio.sampleRate),
      channels: optionalPositiveInteger(audio.channels),
      maxSeconds: optionalPositiveInteger(audio.maxSeconds),
      minBytes: optionalPositiveInteger(audio.minBytes),
    },
    rewrite: {
      maxTokens: optionalPositiveInteger(rewrite.maxTokens),
    },
  };
};

export const loadConfigFile = (): ConfigFile => {
  if (!existsSync(CONFIG_PATH)) return {};
  return parseConfigFile(JSON.parse(readFileSync(CONFIG_PATH, "utf8")));
};

const stringFromEnv = (name: string, fallback: string): string => process.env[name]?.trim() || fallback;

const integerFromEnv = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const loadConfig = (): DictateConfig => {
  const file = loadConfigFile();
  return {
    keybind: stringFromEnv("PI_DICTATE_KEYBIND", file.keybind ?? "ctrl+r"),
    sttEndpoint: stringFromEnv("PI_DICTATE_STT_ENDPOINT", file.stt?.endpoint ?? "http://127.0.0.1:10301/v1/audio/transcriptions"),
    sttModel: stringFromEnv("PI_DICTATE_STT_MODEL", file.stt?.model ?? "whisper-1"),
    sttLanguage: stringFromEnv("PI_DICTATE_STT_LANGUAGE", file.stt?.language ?? "zh"),
    ffmpegPath: stringFromEnv("PI_DICTATE_FFMPEG", file.audio?.ffmpegPath ?? "ffmpeg"),
    inputFormat: stringFromEnv("PI_DICTATE_INPUT_FORMAT", file.audio?.inputFormat ?? "avfoundation"),
    input: stringFromEnv("PI_DICTATE_INPUT", file.audio?.input ?? ":0"),
    sampleRate: integerFromEnv("PI_DICTATE_SAMPLE_RATE", file.audio?.sampleRate ?? 16000),
    channels: integerFromEnv("PI_DICTATE_CHANNELS", file.audio?.channels ?? 1),
    maxSeconds: integerFromEnv("PI_DICTATE_MAX_SECONDS", file.audio?.maxSeconds ?? 120),
    minBytes: integerFromEnv("PI_DICTATE_MIN_BYTES", file.audio?.minBytes ?? 4096),
    rewriteMaxTokens: integerFromEnv("PI_DICTATE_REWRITE_MAX_TOKENS", file.rewrite?.maxTokens ?? 1000),
  };
};
