# pi-dictate

Local-first macOS voice dictation for Pi.

`pi-dictate` records from the macOS microphone with `ffmpeg`, sends audio to a local Whisper/OpenAI-compatible transcription endpoint, rewrites the transcript with Pi's current model, then either inserts the corrected text into the editor or sends it to the agent.

## Status

Early macOS-only version.

## Architecture

The extension is intentionally split into small modules:

- `src/audio/recorder.ts` - macOS `ffmpeg` recording to a temporary WAV file.
- `src/stt/whisper.ts` - local OpenAI-compatible Whisper transcription client.
- `src/rewrite/current-model.ts` - transcript rewrite using Pi's active model and auth.
- `src/core/controller.ts` - dictation state machine (`idle`, `recording`, `transcribing`, `rewriting`).
- `src/ui/editor.ts` - editor wrapper, key handling, and status label.
- `src/index.ts` - Pi extension wiring, commands, session persistence.

This keeps provider support, recording, rewrite, and UI replaceable without rewriting the whole package.

## Requirements

- macOS
- `ffmpeg`
- A local OpenAI-compatible Whisper endpoint, for example `whisper-server` from `whisper.cpp`.

## Recommended whisper-server presets

Fastest, lower accuracy:

```bash
whisper-server --host 127.0.0.1 --port 10301 \
  --model "$HOME/.local/share/whisper.cpp/models/ggml-tiny.bin" \
  --inference-path /v1/audio/transcriptions \
  --convert --language zh \
  --threads 8 --no-timestamps --best-of 1 --no-fallback
```

Balanced default:

```bash
whisper-server --host 127.0.0.1 --port 10301 \
  --model "$HOME/.local/share/whisper.cpp/models/ggml-base.bin" \
  --inference-path /v1/audio/transcriptions \
  --convert --language zh \
  --threads 8 --no-timestamps --best-of 1 --no-fallback
```

More accurate, slower:

```bash
whisper-server --host 127.0.0.1 --port 10301 \
  --model "$HOME/.local/share/whisper.cpp/models/ggml-small.bin" \
  --inference-path /v1/audio/transcriptions \
  --convert --language zh \
  --threads 8 --no-timestamps --best-of 1 --no-fallback
```

Use `/dictate-config` inside Pi to show these presets.

## Install

From a local checkout:

```bash
pi install /absolute/path/to/pi-dictate
```

After publishing:

```bash
pi install npm:pi-dictate@0.1.0
```

If you also have `pi-voice-stt` installed with the same keybinding, remove or disable it to avoid keybinding conflicts.

## Usage

Default keybinding: `ctrl+r`.

- `ctrl+r` when idle: start recording.
- `ctrl+r` while recording: stop, transcribe, rewrite, and insert corrected text into the editor.
- `enter` while recording: stop, transcribe, rewrite, and send corrected text to Pi.
- `escape` while recording: cancel.

The user message shows only the corrected text. The raw Whisper transcript, rewrite result, and stage timings are saved as extension state. STT network failures are retried automatically. If transcription succeeds but rewrite fails, the raw transcript is inserted into the editor as a recoverable fallback.

## Commands

```text
/dictate-status
```

Show current mode, keybinding, STT endpoint, and config file path.

```text
/dictate-last
```

Show the last raw transcript, corrected message, rewrite error if any, and stage timings.

```text
/dictate-config
```

Show config file path and recommended `whisper-server` presets.

```text
/dictate-doctor
```

Check platform, current config, and whether the local Whisper endpoint is reachable.

## Configuration

Configuration file:

```text
~/.pi-dictate/config.json
```

Example:

```json
{
  "keybind": "ctrl+r",
  "stt": {
    "endpoint": "http://127.0.0.1:10301/v1/audio/transcriptions",
    "model": "whisper-1",
    "language": "zh"
  },
  "audio": {
    "ffmpegPath": "ffmpeg",
    "inputFormat": "avfoundation",
    "input": ":0",
    "sampleRate": 16000,
    "channels": 1,
    "maxSeconds": 120
  },
  "rewrite": {
    "maxTokens": 1000,
    "temperature": 0,
    "reasoning": "low"
  }
}
```

Environment variables override the config file:

| Variable | Default | Description |
| --- | --- | --- |
| `PI_DICTATE_KEYBIND` | `ctrl+r` | Dictation keybinding |
| `PI_DICTATE_STT_ENDPOINT` | `http://127.0.0.1:10301/v1/audio/transcriptions` | OpenAI-compatible STT endpoint |
| `PI_DICTATE_STT_MODEL` | `whisper-1` | STT model form field |
| `PI_DICTATE_STT_LANGUAGE` | `zh` | STT language form field |
| `PI_DICTATE_FFMPEG` | `ffmpeg` | ffmpeg executable |
| `PI_DICTATE_INPUT_FORMAT` | `avfoundation` | ffmpeg input format |
| `PI_DICTATE_INPUT` | `:0` | ffmpeg input device |
| `PI_DICTATE_MAX_SECONDS` | `120` | Maximum recording duration |
| `PI_DICTATE_REWRITE_MAX_TOKENS` | `1000` | Max tokens for rewrite call |

Config file rewrite overrides:

| Field | Type | Description |
| --- | --- | --- |
| `rewrite.temperature` | number | Override rewrite temperature per-provider default |
| `rewrite.reasoning` | string | Override rewrite reasoning level (`minimal`/`low`/`medium`/`high`/`xhigh`)

## Security and privacy

- Audio is sent only to the configured STT endpoint. The default is localhost.
- Temporary WAV files are removed after transcription.
- The rewrite step uses Pi's active model, so corrected transcript processing follows that model/provider's transport and data policy.
- This package does not support remote STT providers in v1.
