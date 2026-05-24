import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { startRecording, type RecordingHandle } from "../audio/recorder";
import { loadConfig } from "../config";
import { rewriteTranscript } from "../rewrite/current-model";
import { transcribe } from "../stt/whisper";

export type DictateMode = "idle" | "recording" | "processing";

export type DictationRecord = {
  raw: string;
  corrected: string;
  timestamp: number;
};

type StopAction = "insert" | "send";

type ControllerOptions = {
  onModeChange(mode: DictateMode, ctx: ExtensionContext | undefined): void;
  onRecord(record: DictationRecord): void;
  notify(ctx: ExtensionContext | undefined, message: string, type?: "info" | "warning" | "error"): void;
  sendUserMessage(ctx: ExtensionContext, text: string): void;
};

export const createController = (options: ControllerOptions) => {
  let mode: DictateMode = "idle";
  let recording: RecordingHandle | undefined;
  let lastContext: ExtensionContext | undefined;
  let operation: Promise<void> | undefined;
  let disposed = false;

  const remember = (ctx: ExtensionContext | undefined) => {
    if (ctx) lastContext = ctx;
  };

  const setMode = (nextMode: DictateMode, ctx?: ExtensionContext) => {
    if (disposed && nextMode !== "idle") return;
    mode = nextMode;
    remember(ctx);
    options.onModeChange(nextMode, ctx ?? lastContext);
  };

  const cancel = async (ctx?: ExtensionContext) => {
    remember(ctx);
    if (recording) {
      const active = recording;
      recording = undefined;
      if (active.timeout) clearTimeout(active.timeout);
      await active.dispose();
      setMode("idle", ctx);
      options.notify(ctx, "Dictation cancelled.");
      return;
    }
    options.notify(ctx, mode === "processing" ? "Dictation is already processing and cannot be cancelled yet." : "No active dictation.", "warning");
  };

  const start = async (ctx: ExtensionContext) => {
    remember(ctx);
    if (disposed) return;
    if (mode !== "idle") {
      options.notify(ctx, `Dictation is already ${mode}.`, "warning");
      return;
    }

    const config = loadConfig();
    const active = startRecording(config);
    recording = active;
    active.timeout = setTimeout(() => {
      if (!recording || disposed) return;
      const timeoutContext = lastContext;
      if (!timeoutContext) return;
      void stop(timeoutContext, "insert").catch((error: unknown) => {
        options.notify(timeoutContext, error instanceof Error ? error.message : String(error), "error");
      });
    }, config.maxSeconds * 1000);
    setMode("recording", ctx);
    options.notify(ctx, `Recording… press ${config.keybind} to insert, Enter to send, Esc to cancel.`);
  };

  const stop = async (ctx: ExtensionContext, action: StopAction) => {
    remember(ctx);
    if (!recording) return;
    if (mode === "processing") return;

    const active = recording;
    recording = undefined;
    if (active.timeout) clearTimeout(active.timeout);
    setMode("processing", ctx);

    const currentOperation = (async () => {
      const config = loadConfig();
      try {
        options.notify(ctx, "Transcribing and rewriting…");
        const audioPath = await active.stop();
        const raw = (await transcribe(audioPath, config, ctx.signal)).text;
        const corrected = await rewriteTranscript(raw, ctx, config);
        const record = { raw, corrected, timestamp: Date.now() } satisfies DictationRecord;
        options.onRecord(record);

        if (action === "send") {
          options.sendUserMessage(ctx, corrected);
          options.notify(ctx, "Dictation sent.");
        } else {
          const current = ctx.ui.getEditorText();
          const separator = current && !current.endsWith(" ") && !current.endsWith("\n") ? " " : "";
          ctx.ui.setEditorText(`${current}${separator}${corrected}`);
          options.notify(ctx, "Dictation inserted.");
        }
      } finally {
        await active.dispose();
      }
    })();

    operation = currentOperation;
    try {
      await currentOperation;
    } finally {
      if (operation === currentOperation) operation = undefined;
      setMode("idle", ctx);
    }
  };

  const dispose = async () => {
    disposed = true;
    const active = recording;
    recording = undefined;
    if (active?.timeout) clearTimeout(active.timeout);
    await active?.dispose();
    await operation?.catch(() => undefined);
    setMode("idle", lastContext);
  };

  return {
    getMode: () => mode,
    start,
    stopInsert: (ctx: ExtensionContext) => stop(ctx, "insert"),
    stopSend: (ctx: ExtensionContext) => stop(ctx, "send"),
    cancel,
    dispose,
  };
};
