import type { Component } from "@earendil-works/pi-tui";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { MessageRenderer } from "@earendil-works/pi-coding-agent";
import type { DictationRecord } from "../core/controller";

const formatDuration = (ms: number): string => `${(ms / 1000).toFixed(2)}s`;

type DictationDetails = Omit<DictationRecord, "timestamp">;

const isDictationDetails = (value: unknown): value is DictationDetails => {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return typeof r.raw === "string" && typeof r.corrected === "string";
};

const TRUNCATE_LENGTH = 60;

const truncate = (text: string): string => {
  if (text.length <= TRUNCATE_LENGTH) return text;
  return `${text.slice(0, TRUNCATE_LENGTH)}…`;
};

export const createDictationRenderer = (): MessageRenderer<DictationDetails> => {
  return (message, options, theme): Component | undefined => {
    const details = message.details;
    if (!isDictationDetails(details)) return undefined;

    const container = new Container();

    if (options.expanded) {
      container.addChild(new Text(theme.fg("muted", `Raw: ${details.raw || "(empty)"}`)));
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("dim", `Corrected: ${details.corrected || "(empty)"}`)));

      const timings = (details as DictationRecord).timings;
      if (timings) {
        container.addChild(new Spacer(1));
        container.addChild(
          new Text(
            theme.fg(
              "dim",
              `Timings: recording ${formatDuration(timings.recordingMs)} · transcribing ${formatDuration(timings.transcribingMs)} · rewriting ${formatDuration(timings.rewritingMs)} · total ${formatDuration(timings.totalMs)}`,
            ),
          ),
        );
      }

      if ((details as DictationRecord).rewriteFailed) {
        container.addChild(new Spacer(1));
        container.addChild(
          new Text(theme.fg("warning", `Rewrite failed: ${(details as DictationRecord).rewriteError ?? "unknown"}`)),
        );
      }
    } else {
      const corrected = details.corrected || "(empty)";
      const label = theme.fg("accent", "[dictation]");
      container.addChild(new Text(`${label} ${theme.fg("dim", truncate(corrected))}`));
    }

    return container;
  };
};
