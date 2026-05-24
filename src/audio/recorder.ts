import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DictateConfig } from "../config";
import { formatError, truncate } from "../utils";

const MAX_STDERR_BYTES = 24 * 1024;

export type RecordingHandle = {
  outputPath: string;
  timeout?: ReturnType<typeof setTimeout>;
  stop(): Promise<string>;
  dispose(): Promise<void>;
};

const collectStderr = (stream: NodeJS.ReadableStream): (() => string) => {
  let stderr = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    stderr += chunk;
    if (Buffer.byteLength(stderr, "utf8") > MAX_STDERR_BYTES) stderr = stderr.slice(-MAX_STDERR_BYTES);
  });
  return () => stderr;
};

const waitForExit = (process: ChildProcess): Promise<string> => {
  return new Promise((resolve) => {
    process.once("error", (error) => resolve(`process error: ${formatError(error)}`));
    process.once("close", (code, signal) => resolve(signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`));
  });
};

export const startRecording = (config: DictateConfig): RecordingHandle => {
  if (process.platform !== "darwin") throw new Error("pi-dictate currently supports macOS only.");

  const tempDir = mkdtempSync(join(tmpdir(), "pi-dictate-"));
  const outputPath = join(tempDir, "recording.wav");
  const child = spawn(config.ffmpegPath, [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "warning",
    "-f",
    config.inputFormat,
    "-i",
    config.input,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    String(config.sampleRate),
    "-ac",
    String(config.channels),
    "-y",
    outputPath,
  ], { stdio: ["ignore", "ignore", "pipe"] });

  const getStderr = collectStderr(child.stderr);
  const exited = waitForExit(child);
  let stopped = false;

  const terminate = () => {
    if (child.exitCode !== null || child.killed) return;
    child.kill("SIGTERM");
  };

  const stop = async () => {
    if (!stopped) {
      stopped = true;
      terminate();
    }

    const exitResult = await exited;
    const stderrText = getStderr();
    let size = 0;
    try {
      size = (await stat(outputPath)).size;
    } catch {
      throw new Error(`ffmpeg did not create an audio file (${exitResult}). ${truncate(stderrText)}`);
    }

    if (size < config.minBytes) {
      throw new Error(`Recording is too small (${size} bytes). Check microphone permission/device. ${truncate(stderrText)}`);
    }

    return outputPath;
  };

  const dispose = async () => {
    if (!stopped) {
      stopped = true;
      terminate();
    }
    await exited.catch(() => undefined);
    await rm(tempDir, { force: true, recursive: true }).catch(() => undefined);
  };

  return { outputPath, stop, dispose };
};
