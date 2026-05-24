export type ServerPreset = {
  name: string;
  description: string;
  model: string;
  extraArgs: string[];
};

export const SERVER_PRESETS: ServerPreset[] = [
  {
    name: "fast",
    description: "Fastest; lower accuracy. Good for short English/simple commands.",
    model: "ggml-tiny.bin",
    extraArgs: ["--threads", "8", "--no-timestamps", "--best-of", "1", "--no-fallback"],
  },
  {
    name: "balanced",
    description: "Recommended default on Intel Macs; much faster than small with usable accuracy.",
    model: "ggml-base.bin",
    extraArgs: ["--threads", "8", "--no-timestamps", "--best-of", "1", "--no-fallback"],
  },
  {
    name: "accurate",
    description: "Better Chinese accuracy; slower on CPU-only machines.",
    model: "ggml-small.bin",
    extraArgs: ["--threads", "8", "--no-timestamps", "--best-of", "1", "--no-fallback"],
  },
];

export const renderServerPresets = (): string => {
  return SERVER_PRESETS.map((preset) => {
    const args = preset.extraArgs.join(" ");
    return `${preset.name}: ${preset.description}\nwhisper-server --host 127.0.0.1 --port 10301 --model "$HOME/.local/share/whisper.cpp/models/${preset.model}" --inference-path /v1/audio/transcriptions --convert --language zh ${args}`;
  }).join("\n\n");
};
