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

const integerFromEnv = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const loadConfig = (): DictateConfig => ({
  keybind: process.env.PI_DICTATE_KEYBIND?.trim() || "ctrl+r",
  sttEndpoint: process.env.PI_DICTATE_STT_ENDPOINT?.trim() || "http://127.0.0.1:10301/v1/audio/transcriptions",
  sttModel: process.env.PI_DICTATE_STT_MODEL?.trim() || "whisper-1",
  sttLanguage: process.env.PI_DICTATE_STT_LANGUAGE?.trim() || "zh",
  ffmpegPath: process.env.PI_DICTATE_FFMPEG?.trim() || "ffmpeg",
  inputFormat: process.env.PI_DICTATE_INPUT_FORMAT?.trim() || "avfoundation",
  input: process.env.PI_DICTATE_INPUT?.trim() || ":0",
  sampleRate: integerFromEnv("PI_DICTATE_SAMPLE_RATE", 16000),
  channels: integerFromEnv("PI_DICTATE_CHANNELS", 1),
  maxSeconds: integerFromEnv("PI_DICTATE_MAX_SECONDS", 120),
  minBytes: integerFromEnv("PI_DICTATE_MIN_BYTES", 4096),
  rewriteMaxTokens: integerFromEnv("PI_DICTATE_REWRITE_MAX_TOKENS", 1000),
});
