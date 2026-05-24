import type { CustomEntry, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_PATH, loadConfig } from "./config";
import { createController, type DictationRecord } from "./core/controller";
import { formatDoctorResults, runDoctor } from "./doctor";
import { renderServerPresets } from "./server-presets";
import { createDictationRenderer } from "./ui/renderer";
import { createDictateEditorFactory, createInputIndicator } from "./ui/editor";
import { formatError } from "./utils";

const notify = (ctx: ExtensionContext | undefined, message: string, type: "info" | "warning" | "error" = "info") => {
  if (!ctx?.hasUI) return;
  ctx.ui.notify(`Pi Dictate: ${message}`, type);
};

const formatDuration = (ms: number): string => `${(ms / 1000).toFixed(2)}s`;

const renderRecord = (record: DictationRecord): string => {
  const time = new Date(record.timestamp).toLocaleString();
  const timings = record.timings
    ? `\n\nTimings:\nrecording: ${formatDuration(record.timings.recordingMs)}\ntranscribing: ${formatDuration(record.timings.transcribingMs)}\nrewriting: ${formatDuration(record.timings.rewritingMs)}\ntotal: ${formatDuration(record.timings.totalMs)}`
    : "";
  const rewriteStatus = record.rewriteFailed ? `\n\nRewrite failed:\n${record.rewriteError ?? "unknown error"}` : "";
  return `Pi Dictate last transcript (${time})\n\nRaw transcript:\n${record.raw}\n\nCorrected message:\n${record.corrected}${rewriteStatus}${timings}`;
};

const isDictationRecord = (value: unknown): value is DictationRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.raw === "string" && typeof record.corrected === "string" && typeof record.timestamp === "number";
};

const isDictationEntry = (entry: { type: string; customType?: string }): entry is CustomEntry<DictationRecord> => {
  return entry.type === "custom" && entry.customType === "pi-dictate";
};

export default function piDictateExtension(pi: ExtensionAPI) {
  const config = loadConfig();
  const inputIndicator = createInputIndicator(config.keybind);
  let lastRecord: DictationRecord | undefined;

  pi.registerMessageRenderer("pi-dictate", createDictationRenderer());

  const controller = createController({
    onModeChange: (mode) => inputIndicator.setMode(mode),
    onRecord: (record) => {
      lastRecord = record;
      pi.appendEntry("pi-dictate", record);
    },
    onMessage: (record, ctx) => {
      pi.sendMessage(
        {
          customType: "pi-dictate",
          content: `Dictation: ${record.corrected || "(empty)"}`,
          display: true,
          details: { raw: record.raw, corrected: record.corrected, timings: record.timings, rewriteFailed: record.rewriteFailed, rewriteError: record.rewriteError },
        },
        { triggerTurn: false },
      );
    },
    notify,
    sendUserMessage: (ctx, text) => {
      if (ctx.isIdle()) pi.sendUserMessage(text);
      else pi.sendUserMessage(text, { deliverAs: "followUp" });
    },
  });

  pi.registerCommand("dictate-last", {
    description: "Show the last raw dictation transcript and corrected message.",
    handler: async (_args, ctx) => {
      if (lastRecord) {
        ctx.ui.notify(renderRecord(lastRecord), "info");
        return;
      }

      const entry = [...ctx.sessionManager.getEntries()].reverse().find(isDictationEntry);
      if (isDictationRecord(entry?.data)) {
        ctx.ui.notify(renderRecord(entry.data), "info");
        return;
      }

      ctx.ui.notify("No dictation transcript recorded yet.", "warning");
    },
  });

  pi.registerCommand("dictate-status", {
    description: "Show pi-dictate status and configuration.",
    handler: async (_args, ctx) => {
      const current = loadConfig();
      ctx.ui.notify(`mode ${controller.getMode()} · keybind ${current.keybind} · endpoint ${current.sttEndpoint} · config ${CONFIG_PATH}`, "info");
    },
  });

  pi.registerCommand("dictate-config", {
    description: "Show pi-dictate config path and recommended whisper-server presets.",
    handler: async (_args, ctx) => {
      ctx.ui.notify(`Config file: ${CONFIG_PATH}\n\nWhisper server presets:\n\n${renderServerPresets()}`, "info");
    },
  });

  pi.registerCommand("dictate-doctor", {
    description: "Check pi-dictate platform, config, and local Whisper endpoint.",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Running pi-dictate doctor…", "info");
      ctx.ui.notify(formatDoctorResults(await runDoctor(loadConfig())), "info");
    },
  });

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    const previousEditor = ctx.ui.getEditorComponent();
    ctx.ui.setEditorComponent(createDictateEditorFactory(previousEditor, {
      keybind: loadConfig().keybind,
      ctx,
      getMode: () => controller.getMode(),
      renderLabel: (theme) => inputIndicator.renderLabel(theme),
      attachTui: (tui) => inputIndicator.attach(tui),
      onToggle: (handlerCtx) => {
        const action = controller.getMode() === "idle" ? controller.start(handlerCtx) : controller.stopInsert(handlerCtx);
        void action.catch((error: unknown) => notify(handlerCtx, formatError(error), "error"));
      },
      onCancel: (handlerCtx) => {
        void controller.cancel(handlerCtx).catch((error: unknown) => notify(handlerCtx, formatError(error), "error"));
      },
      onSend: (handlerCtx) => {
        void controller.stopSend(handlerCtx).catch((error: unknown) => notify(handlerCtx, formatError(error), "error"));
      },
    }));
  });

  pi.on("session_shutdown", async () => {
    await controller.dispose();
    inputIndicator.dispose();
  });
}
