# Video Subtitler

Batch generate and embed subtitles for `.mp4` videos using [faster-whisper](https://github.com/SYSTRAN/fater-whisper) (GPU-accelerated Whisper) and ffmpeg.

Transcribes speech to `.srt`, then muxes subtitles into video as a toggleable soft subtitle track — no re-encode, original quality preserved. Also includes a Gradio web UI with model/device/compute selection, editable SRT, video regeneration, and SRT download.

## Quick Start

```bash
git clone https://github.com/nick8592/video-subtitler.git
cd video-subtitler
./setup.sh
```

That's it. `setup.sh` creates a venv, installs everything, and pre-downloads all Whisper models. Then:

```bash
source .venv/bin/activate
python3 add_subtitles.py /path/to/videos --srt
```

Or launch the web UI:

```bash
python3 app.py
```

### Prerequisites

- [ffmpeg](https://ffmpeg.org/) (`apt install ffmpeg` / `brew install ffmpeg`)
- Python 3.10+
- [uv](https://docs.astral.sh/uv/) (recommended) or `python3-venv`
- NVIDIA GPU with CUDA (recommended) — falls back to CPU automatically

## Web UI

```bash
python3 app.py
```

Opens a Gradio interface at `http://127.0.0.1:7860` with:

- **Model / Device / Compute** — choose Whisper model size, CPU or CUDA, and compute type
- **Editable SRT** — edit the generated subtitle text and regenerate the video
- **Regenerate Video** — burn or mux the edited SRT back into the video
- **Download SRT** — download the `.srt` file directly

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

# Use a smaller/faster model (less VRAM, less accurate)
python3 add_subtitles.py /path/to/videos --model medium
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
2. **Transcribe** — faster-whisper `large-v3` model (GPU, float16), primary language `zh` with automatic English detection
3. **Save `.srt`** — written next to the original video
4. **Mux** — embed `.srt` as a soft subtitle track (`mov_text`) into a new `_subtitled.mp4` (no re-encode)

Idempotent — skips files that already have `.srt` or `_subtitled.mp4`. Delete those files to re-run.

## Configuration

### Web UI

Model, device, and compute type are selected via dropdowns in the interface. No config edits needed.

### CLI

Edit the constants at the top of `add_subtitles.py`:

| Constant | Default | Description |
|---|---|---|
| `MODEL_SIZE` | `large-v3` | Whisper model size (`tiny`, `base`, `small`, `medium`, `large-v3`) |
| `DEVICE` | `cuda` | `cuda` for GPU, `cpu` for CPU |
| `COMPUTE_TYPE` | `float16` | `int8_float16` for less VRAM |
| `LANGUAGE` | `en` | Primary language (Whisper auto-detects mixed segments) |
| `VAD_FILTER` | `True` | Skip silence during transcription |

## License

MIT
