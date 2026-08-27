<p align="center">
  <img src="docs/signboard_v5.png?v=1" alt="Video Subtitler" width="800">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-red?style=flat-square" alt="License: MIT">
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.10+">
  <img src="https://img.shields.io/badge/CUDA-GPU_Accelerated-76B900?style=flat-square&logo=nvidia&logoColor=white" alt="CUDA">
  <img src="https://img.shields.io/badge/faster--whisper-Powered-FF6F00?style=flat-square" alt="faster-whisper">
  <img src="https://img.shields.io/github/stars/nick8592/video-subtitler?style=flat-square&color=red" alt="GitHub Stars">
</p>

Auto-generate and embed subtitles for `.mp4` videos using [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (GPU-accelerated Whisper) and ffmpeg.

- **Soft subtitles** — mux as a toggleable track, no re-encode, original quality preserved
- **Hardcoded subtitles** — burn into video for social media / GitHub
- **Font customization** — choose font, size, color, outline, shadow, alignment and preview before generating
- **Local web UI** — FastAPI + vanilla JS frontend, model/device/compute selection, editable SRT, video regeneration, SRT download

## Quick Start

```bash
git clone https://github.com/nick8592/video-subtitler.git
cd video-subtitler
./setup.sh
```

`setup.sh` creates a venv, installs everything, and pre-downloads all Whisper models.

### Web UI (recommended)

```bash
source .venv/bin/activate
python3 server.py
```

Opens the local web UI at `http://127.0.0.1:7860`. Upload a video, pick your settings, and generate subtitles — all from the browser.

### CLI

```bash
source .venv/bin/activate
python3 add_subtitles.py /path/to/videos
```

This runs the full pipeline: transcribe speech → generate `.srt` → mux soft subtitle track into video.

> **Note:** The CLI is the only way to process **multiple videos in batch**. The web UI handles one video at a time.

### Prerequisites

- [ffmpeg](https://ffmpeg.org/) (`apt install ffmpeg` / `brew install ffmpeg`)
- Python 3.10+
- [uv](https://docs.astral.sh/uv/) (recommended) or `python3-venv`
- NVIDIA GPU with CUDA (recommended) — falls back to CPU automatically

## Usage (CLI)

```bash
# Full pipeline: transcribe + soft subtitle (toggleable, default)
python3 add_subtitles.py /path/to/videos

# Burn subtitles into video (always visible, for social media/GitHub)
python3 add_subtitles.py /path/to/videos --hardcode

# Generate .srt files only (e.g. for editing in CapCut)
python3 add_subtitles.py /path/to/videos --srt

# Mux existing .srt files into videos (skip transcription)
python3 add_subtitles.py /path/to/videos --mux

# Process a single .mp4 file
python3 add_subtitles.py /path/to/video.mp4 --file

# Override model and language
python3 add_subtitles.py /path/to/videos --model medium --language en

# Burn subtitles with custom font styling
python3 add_subtitles.py /path/to/videos --hardcode --font-name "Arial" --font-size 18 --font-color "#FFFF00" --outline 2
```

## Example

A 10-second sample from a 4K travel video (Indonesia, Mount Bromo — cloud river) is included in `example/`.

### Before — Original

https://github.com/user-attachments/assets/8a65b94b-9e78-46a4-9be5-1746a26359a3

### After — With subtitles

https://github.com/user-attachments/assets/d996cfec-f958-4aba-aea8-9e8952b5877c

> **Note:** GitHub's video player doesn't support soft subtitle tracks. The "After" example above has subtitles burned in for visibility. The actual script outputs soft subtitles (toggleable) by default — use `--hardcode` to burn them in instead.

| File | Resolution | Duration | Size | Codec |
|---|---|---|---|---|
| `sample.mp4` | 1920×1440 | 10.0s | 7 MB | H.264 |
| `sample_subtitled.mp4` | 1920×1440 | 10.0s | 7 MB | H.264 (subtitles burned in) |

### Generated subtitle (`sample.srt`)

```srt
1
00:00:01,200 --> 00:00:05,200
yeah the cloud is climbing through the hill
```

### How it was made

```bash
# Extract 10s clip from full video
ffmpeg -i "bromo cloud river.mp4" -t 10 -vf "scale=1920:1440" -c:v libx264 -crf 23 example/sample.mp4

# Generate subtitle
python3 add_subtitles.py example --srt

# Mux subtitle into video
python3 add_subtitles.py example
```

## How it works

For each `.mp4` in the target directory:

1. **Extract audio** — 16 kHz mono WAV via ffmpeg
2. **Transcribe** — faster-whisper `large-v3` model (GPU, float16), language auto-detected
3. **Save `.srt`** — written next to the original video
4. **Mux** — embed `.srt` as a soft subtitle track (`mov_text`) into a new `_subtitled.mp4` (no re-encode)

Idempotent — skips files that already have `.srt` or `_subtitled.mp4`. Delete those files to re-run.

## Configuration

### Web UI

Model, device, compute type, and font styling are configured via the web interface at `http://127.0.0.1:7860`. CUDA is auto-detected at startup — if no GPU is found, the UI defaults to CPU with `int8` compute type.

Font customization controls (font name, size, color, outline, shadow, border style, alignment, vertical margin) are available when **Hardcode** mode is selected. A **Font Preview** button renders a single frame with sample subtitle text so you can verify styling before generating the full video.

> **Note:** The web UI processes one video at a time. For batch processing of multiple videos, use the CLI.

### CLI

Set via environment variables or edit the constants at the top of `add_subtitles.py`:

| Constant | Env Variable | Default | Description |
|---|---|---|---|
| `MODEL_SIZE` | `WHISPER_MODEL` | `large-v3` | Whisper model size (`tiny`, `base`, `small`, `medium`, `large-v3`) |
| `DEVICE` | `WHISPER_DEVICE` | `cuda` | `cuda` for GPU, `cpu` for CPU |
| `COMPUTE_TYPE` | `WHISPER_COMPUTE_TYPE` | `float16` | `int8_float16` for less VRAM, `int8` for CPU-only |
| `LANGUAGE` | — | `auto` | Primary language code (e.g. `en`, `zh`), or `auto` to detect |
| `VAD_FILTER` | — | `True` | Skip silence during transcription |

Font styling options (hardcode mode only):

| CLI Flag | Default | Description |
|---|---|---|
| `--font-name` | `Literata` | Font family name |
| `--font-size` | `12` | Font size in points |
| `--font-color` | `#FFFFFF` | Text color (hex) |
| `--outline` | `0` | Outline/border thickness |
| `--shadow` | `0` | Shadow depth in pixels |
| `--border-style` | `1` | `1` = outline + shadow, `3` = opaque box |
| `--alignment` | `2` | Position: 1–3 bottom, 5–7 top, 9–11 mid (left/center/right) |
| `--margin-v` | `20` | Vertical margin from edge in pixels |

## Acknowledgments

- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — GPU-accelerated Whisper transcription using CTranslate2
- [OpenAI Whisper](https://github.com/openai/whisper) — the original Whisper speech recognition model

## License

MIT
